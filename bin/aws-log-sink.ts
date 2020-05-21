#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { AwsLogSinkStack } from '../lib/aws-log-sink-stack';
import { LOG_SINK_STACK_NAME_ENV_KEY, DEFAULT_LOG_SINK_STACK_NAME } from '../lib/src/constants';

const logSinkStackName = process.env[LOG_SINK_STACK_NAME_ENV_KEY] || DEFAULT_LOG_SINK_STACK_NAME;
const app = new cdk.App();
new AwsLogSinkStack(app, logSinkStackName);
