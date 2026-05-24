import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { TabParamList, HomeStackParamList, JobsStackParamList, ProfileStackParamList } from './types';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { JobRequestDetailScreen } from '@/screens/home/JobRequestDetailScreen';
import { JobsScreen } from '@/screens/jobs/JobsScreen';
import { JobDetailScreen } from '@/screens/jobs/JobDetailScreen';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';

const Tab = createBottomTabNavigator<TabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const JobsStack = createNativeStackNavigator<JobsStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

function HomeStackNav() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <HomeStack.Screen name="JobRequestDetail" component={JobRequestDetailScreen} options={{ title: 'Job Request' }} />
    </HomeStack.Navigator>
  );
}

function JobsStackNav() {
  return (
    <JobsStack.Navigator>
      <JobsStack.Screen name="Jobs" component={JobsScreen} options={{ title: 'Jobs' }} />
      <JobsStack.Screen name="JobDetail" component={JobDetailScreen} options={{ title: 'Job Detail' }} />
    </JobsStack.Navigator>
  );
}

function ProfileStackNav() {
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </ProfileStack.Navigator>
  );
}

export function TabNavigator() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="HomeTab" component={HomeStackNav} options={{ title: 'Home' }} />
      <Tab.Screen name="JobsTab" component={JobsStackNav} options={{ title: 'Jobs' }} />
      <Tab.Screen name="ProfileTab" component={ProfileStackNav} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}
