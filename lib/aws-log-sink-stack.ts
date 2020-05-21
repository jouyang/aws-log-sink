/* eslint-disable no-unused-vars */
import { App, Stack, StackProps, CfnElement, CfnOutput } from '@aws-cdk/core';
import { Function, AssetCode, Runtime, StartingPosition } from '@aws-cdk/aws-lambda';
import { Role, ServicePrincipal, ManagedPolicy, PolicyStatement, Effect, Policy } from '@aws-cdk/aws-iam';
import { Stream } from '@aws-cdk/aws-kinesis';
import { Bucket } from '@aws-cdk/aws-s3';
import { CrossAccountDestination, CfnDestination } from '@aws-cdk/aws-logs';
import { KinesisEventSource } from '@aws-cdk/aws-lambda-event-sources';
import { LOG_BUCKET_NAME_ENV_KEY, DEFAULT_SHARD_COUNT, DEFAULT_LOG_BUCKET_NAME, SHARD_COUNT_ENV_KEY, SOURCE_ACCOUNT_ENV_KEY } from './src/constants';
import * as path from 'path';

export class AwsLogSinkStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    // Log Bucket Setup
    const bucketName = process.env[LOG_BUCKET_NAME_ENV_KEY] || DEFAULT_LOG_BUCKET_NAME;
    const processedLogbucket = new Bucket(this, 'processedLogbucket', {
      bucketName
    });

    // Log Processor Lambda Role Setup
    const logProcessorLambdaRole = new Role(this, 'logProcessorLambdaRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });

    logProcessorLambdaRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaKinesisExecutionRole')
    );

    processedLogbucket.grantPut(logProcessorLambdaRole);

    // Kinesis Stream Setup
    const shardCount = process.env.SHARD_COUNT ? Number(process.env[SHARD_COUNT_ENV_KEY]) : DEFAULT_SHARD_COUNT;
    const logProcessorStream = new Stream(this, 'logProcessorStream', {
      streamName: 'logProcessorStream',
      shardCount,
    });

    logProcessorStream.grantRead(logProcessorLambdaRole);

    const cloudWatchLogToKinesisRole = new Role(this, 'cloudWatchLogToKinesisRole', {
      assumedBy: new ServicePrincipal(`logs.${this.region}.amazonaws.com`)
    });

    const cloudWatchLogToKinesisRolePolicy = new Policy(this, 'cloudWatchLogToKinesisRolePolicy', {
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['kinesis:PutRecord', 'kinesis:PutRecord'],
          resources: [ logProcessorStream.streamArn ]
        }),
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [ 'iam:PassRole' ],
          resources: [ cloudWatchLogToKinesisRole.roleArn ]
        })
      ]
    });

    cloudWatchLogToKinesisRole.attachInlinePolicy(cloudWatchLogToKinesisRolePolicy);

    // Log Processor Lambda Setup
    const kinesisEventSource = new KinesisEventSource(logProcessorStream, {
      startingPosition: StartingPosition.LATEST
    });

    const logProcessorLambda = new Function(this, 'LogProcessor', {
      code: new AssetCode(path.join(__dirname, 'src')),
      runtime: Runtime.NODEJS_12_X,
      handler: 'log-processor.handler',
      environment: {
        [LOG_BUCKET_NAME_ENV_KEY]: bucketName
      },
      role: logProcessorLambdaRole
    });

    logProcessorLambda.addEventSource(kinesisEventSource);

    // Destination Setup
    const logProcessorStreamDestinationName = 'logProcessorStreamDestination';
    const logProcessorStreamDestination = new CrossAccountDestination(this, logProcessorStreamDestinationName, {
      destinationName: logProcessorStreamDestinationName,
      role: cloudWatchLogToKinesisRole,
      targetArn: logProcessorStream.streamArn
    });

    const logProcessorStreamDestinationArn = `arn:aws:logs:${this.region}:${this.account}:destination:${logProcessorStreamDestinationName}`;

    const allowedSourceAccounts = process.env[SOURCE_ACCOUNT_ENV_KEY] || [ this.account ];
    const cfnDestination = logProcessorStreamDestination.node.defaultChild as CfnDestination;
    cfnDestination.destinationPolicy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Sid: 'AllowSourceAccountToSubscribe',
        Effect: 'Allow',
        Action: 'logs:PutSubscriptionFilter',
        Principal: {
          AWS: allowedSourceAccounts,
        },
        Resource: logProcessorStreamDestinationArn
      }],
    });

    // CDK does not currently resolve dependencies correctly for destination.
    // Explicitly set DependsOn to wait for dependencies to be created.
    cfnDestination.addOverride('DependsOn', [
      (logProcessorStream.node.defaultChild as CfnElement).logicalId,
      (cloudWatchLogToKinesisRole.node.defaultChild as CfnElement).logicalId,
      (cloudWatchLogToKinesisRolePolicy.node.defaultChild as CfnElement).logicalId
    ]);

    const output = new CfnOutput(this, 'logProcessorStreamDestinationArn', {
      value: logProcessorStreamDestinationArn
    });
  }
}
