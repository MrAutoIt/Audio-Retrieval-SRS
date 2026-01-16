import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';

// Simple tab-like navigation without expo-router navigation components
function HomeScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Audio Retrieval SRS</Text>
      <Text>Home screen - Coming soon</Text>
    </View>
  );
}

function InboxScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Inbox</Text>
      <Text>Inbox - Coming soon</Text>
    </View>
  );
}

function LibraryScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Library</Text>
      <Text>Library - Coming soon</Text>
    </View>
  );
}

export default function Index() {
  const [activeTab, setActiveTab] = useState('home');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {activeTab === 'home' && <HomeScreen />}
        {activeTab === 'inbox' && <InboxScreen />}
        {activeTab === 'library' && <LibraryScreen />}
      </View>
      
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'home' && styles.activeTab]} 
          onPress={() => setActiveTab('home')}
        >
          <Text style={[styles.tabText, activeTab === 'home' && styles.activeTabText]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'inbox' && styles.activeTab]} 
          onPress={() => setActiveTab('inbox')}
        >
          <Text style={[styles.tabText, activeTab === 'inbox' && styles.activeTabText]}>Inbox</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'library' && styles.activeTab]} 
          onPress={() => setActiveTab('library')}
        >
          <Text style={[styles.tabText, activeTab === 'library' && styles.activeTabText]}>Library</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
  },
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderTopWidth: 2,
    borderTopColor: '#007AFF',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: '600',
  },
});
