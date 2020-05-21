import { expect as expectCDK, haveResource } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as AwsLogSink from '../lib/aws-log-sink-stack';

test('Lambda Created', () => {
  const app = new cdk.App();
  // WHEN
  const stack = new AwsLogSink.AwsLogSinkStack(app, 'MyTestStack');
  // THEN
  expectCDK(stack).to(haveResource('AWS::Lambda'));
});
