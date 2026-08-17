import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import * as Location from 'expo-location';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Replace with your actual Supabase URL and Anon Key
const supabaseUrl = 'YOUR_SUPABASE_URL';
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY';
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Haversine formula to calculate distance in meters
function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Radius of the earth in m
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  const [locationName, setLocationName] = useState<string | null>(null);
  const [targetLat, setTargetLat] = useState<number | null>(null);
  const [targetLng, setTargetLng] = useState<number | null>(null);
  const [currentDist, setCurrentDist] = useState<number | null>(null);
  
  const [gpsLoading, setGpsLoading] = useState(false);
  const [punching, setPunching] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadUserData();
    }
  }, [session]);

  const loadUserData = async () => {
    try {
      // 1. Get user's assigned branch
      const { data: userData, error: userError } = await supabase
        .from('app_users')
        .select('location')
        .eq('id', session.user.id)
        .single();
      
      if (userError || !userData) {
        Alert.alert('Error', 'Could not fetch user branch.');
        return;
      }
      
      setLocationName(userData.location);

      // 2. Get Branch GPS Coordinates
      const { data: branchData, error: branchError } = await supabase
        .from('locations')
        .select('latitude, longitude')
        .eq('display_name', userData.location)
        .single();
        
      if (branchError || !branchData) {
        Alert.alert('Warning', 'Your branch does not have GPS coordinates configured.');
        return;
      }

      setTargetLat(branchData.latitude);
      setTargetLng(branchData.longitude);

      checkGPSDistance(branchData.latitude, branchData.longitude);
    } catch (e) {
      console.error(e);
    }
  };

  const checkGPSDistance = async (tLat: number, tLng: number) => {
    setGpsLoading(true);
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Permission to access location was denied');
      setGpsLoading(false);
      return;
    }

    let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
    
    // Explicit Mock Location / Fake GPS Check
    if (location.mocked) {
      Alert.alert('Fake GPS Detected', 'Mock location tools are not allowed. Please disable them and try again.');
      setCurrentDist(null);
      setGpsLoading(false);
      return;
    }

    const dist = getDistanceFromLatLonInM(
      location.coords.latitude, 
      location.coords.longitude, 
      tLat, 
      tLng
    );
    setCurrentDist(Math.round(dist));
    setGpsLoading(false);
  };

  const handleLogin = async () => {
    setLoading(true);
    setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    setLoading(false);
  };

  const handlePunch = async (direction: 'in' | 'out') => {
    if (currentDist === null || currentDist > 50) {
      Alert.alert('Geofence Error', 'You must be within 50 meters of the branch to clock in.');
      return;
    }
    setPunching(true);
    
    // Simulate API Call to Supabase Edge Function 'device-push'
    // For now we directly insert into attendance for the MVP
    const { error } = await supabase.from('attendance').insert([{
        employee_id: session.user.id, // Using user ID as emp ID for managers
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('en-US', { hour12: false }),
        status: direction === 'in' ? 'Present' : 'Left',
        location: locationName
    }]);

    if (error) {
      Alert.alert('Error', 'Failed to record punch.');
    } else {
      Alert.alert('Success', `Successfully clocked ${direction}!`);
    }
    
    setPunching(false);
  };

  if (loading && !session) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>;
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.authContainer}>
          <Text style={styles.title}>Staff Sync</Text>
          <Text style={styles.subtitle}>Geofenced Companion App</Text>
          
          {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
          
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#9ca3af"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#9ca3af"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          
          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            <Text style={styles.buttonText}>{loading ? 'Loading...' : 'Sign In'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Staff Sync</Text>
        <TouchableOpacity onPress={() => supabase.auth.signOut()}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.branchTitle}>{locationName || 'Loading Branch...'}</Text>
        
        {!targetLat ? (
          <Text style={styles.warningText}>No GPS coordinates set for this branch.</Text>
        ) : (
          <View style={styles.gpsBox}>
            <Text style={styles.gpsLabel}>Distance to Branch:</Text>
            {gpsLoading ? (
              <ActivityIndicator color="#6366f1" />
            ) : (
              <Text style={[styles.gpsValue, (currentDist !== null && currentDist <= 50) ? styles.success : styles.danger]}>
                {currentDist !== null ? `${currentDist} meters` : 'Unknown'}
              </Text>
            )}
            
            {currentDist !== null && currentDist > 50 && (
              <Text style={styles.dangerText}>You are outside the 50m geofence.</Text>
            )}
            
            <TouchableOpacity 
              style={styles.refreshBtn} 
              onPress={() => checkGPSDistance(targetLat, targetLng)}
            >
              <Text style={styles.refreshBtnText}>Refresh GPS</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.punchBox}>
          <TouchableOpacity 
            style={[styles.punchBtn, styles.punchInBtn, (currentDist === null || currentDist > 50) && styles.disabledBtn]} 
            onPress={() => handlePunch('in')}
            disabled={currentDist === null || currentDist > 50 || punching}
          >
            <Text style={styles.punchBtnText}>{punching ? '...' : 'CLOCK IN'}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.punchBtn, styles.punchOutBtn, (currentDist === null || currentDist > 50) && styles.disabledBtn]} 
            onPress={() => handlePunch('out')}
            disabled={currentDist === null || currentDist > 50 || punching}
          >
            <Text style={styles.punchBtnText}>{punching ? '...' : 'CLOCK OUT'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  container: { flex: 1, backgroundColor: '#0f172a' },
  authContainer: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#818cf8', textAlign: 'center', marginBottom: 32 },
  errorText: { color: '#ef4444', marginBottom: 16, textAlign: 'center' },
  input: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 16, color: '#fff', borderWidth: 1, borderColor: '#334155' },
  button: { backgroundColor: '#6366f1', padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1e293b' },
  headerText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  logoutText: { color: '#ef4444', fontWeight: '600' },
  card: { margin: 20, padding: 20, backgroundColor: '#1e293b', borderRadius: 16, borderWidth: 1, borderColor: '#334155' },
  branchTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  warningText: { color: '#f59e0b', textAlign: 'center' },
  gpsBox: { alignItems: 'center', marginBottom: 32, padding: 16, backgroundColor: '#0f172a', borderRadius: 12 },
  gpsLabel: { color: '#94a3b8', fontSize: 14, marginBottom: 8 },
  gpsValue: { fontSize: 36, fontWeight: '900' },
  success: { color: '#10b981' },
  danger: { color: '#ef4444' },
  dangerText: { color: '#ef4444', fontSize: 12, marginTop: 8 },
  refreshBtn: { marginTop: 16, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#334155', borderRadius: 8 },
  refreshBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  punchBox: { gap: 12 },
  punchBtn: { padding: 20, borderRadius: 12, alignItems: 'center' },
  punchInBtn: { backgroundColor: '#10b981' },
  punchOutBtn: { backgroundColor: '#f43f5e' },
  disabledBtn: { opacity: 0.5, backgroundColor: '#64748b' },
  punchBtnText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1 },
});
