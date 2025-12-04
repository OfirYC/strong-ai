import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60 second default timeout
});

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const userData = await AsyncStorage.getItem('user');
  if (userData) {
    const user = JSON.parse(userData);
    config.headers.Authorization = `Bearer ${user.token}`;
  }
  return config;
});

export default api;
