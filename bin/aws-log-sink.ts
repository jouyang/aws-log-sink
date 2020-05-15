#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { AwsLogSinkStack } from '../lib/aws-log-sink-stack';

const app = new cdk.App();
new AwsLogSinkStack(app, 'AwsLogSinkStack');
