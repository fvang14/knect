import type { NavigatorScreenParams } from '@react-navigation/native';
import type { PendingRequest } from '@/lib/types';

export type HomeStackParamList = {
  Home: undefined;
  JobRequestDetail: { request: PendingRequest };
};

export type JobsStackParamList = {
  Jobs: undefined;
  JobDetail: { jobId: string };
};

export type ProfileStackParamList = {
  Profile: undefined;
};

export type TabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  JobsTab: NavigatorScreenParams<JobsStackParamList>;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};
