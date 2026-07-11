import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { submitIncident, uploadPhoto } from './api';

const CATEGORIES = [
  { key: 'structure_fire', label: '🏠 Structure Fire' },
  { key: 'veld_fire', label: '🌾 Veld / Wildfire' },
  { key: 'vehicle_fire', label: '🚗 Vehicle Fire' },
  { key: 'informal_settlement_fire', label: '🏘️ Informal Settlement Fire' },
  { key: 'hazmat', label: '☣️ Hazmat' },
  { key: 'other', label: '🔥 Other' },
];

export default function App() {
  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [photoUri, setPhotoUri] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Camera permission needed', 'We need camera access so you can show responders the fire.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6, // keep file size reasonable over mobile data
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  async function pickPhotoFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photo library permission needed', 'We need access to your photos to attach one to the report.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotoUri(result.assets[0].uri);
    }
  }

  function removePhoto() {
    setPhotoUri(null);
  }

  async function captureLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location permission needed',
          'We need your location to tell responders where the fire is.'
        );
        setLocating(false);
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      setLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch (err) {
      Alert.alert('Error getting location', err.message);
    } finally {
      setLocating(false);
    }
  }

  async function handleSubmit() {
    if (!category) {
      Alert.alert('Missing info', 'Please select what kind of fire this is.');
      return;
    }
    if (!location) {
      Alert.alert('Missing location', 'Please capture your location first.');
      return;
    }

    setSubmitting(true);
    try {
      let photo_urls = [];
      if (photoUri) {
        const url = await uploadPhoto(photoUri);
        photo_urls = [url];
      }

      const incident = await submitIncident({
        category,
        latitude: location.latitude,
        longitude: location.longitude,
        description,
        photo_urls,
      });
      setSubmittedId(incident.id);
    } catch (err) {
      Alert.alert(
        'Failed to submit report',
        'Check that the backend server is running and reachable from your phone.\n\n' + err.message
      );
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setCategory(null);
    setDescription('');
    setLocation(null);
    setPhotoUri(null);
    setSubmittedId(null);
  }

  // Confirmation screen after a successful submit
  if (submittedId) {
    return (
      <View style={styles.container}>
        <StatusBar style="auto" />
        <View style={styles.confirmationBox}>
          <Text style={styles.confirmationEmoji}>✅</Text>
          <Text style={styles.confirmationTitle}>Report Submitted</Text>
          <Text style={styles.confirmationText}>
            Fire services have been notified. Stay safe and keep your distance from the fire.
          </Text>
          <Text style={styles.confirmationId}>Reference: {submittedId.slice(0, 8)}</Text>
          <TouchableOpacity style={styles.button} onPress={resetForm}>
            <Text style={styles.buttonText}>Report Another Incident</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <StatusBar style="auto" />
      <Text style={styles.header}>🚨 Report a Fire</Text>
      <Text style={styles.subheader}>Select the type of fire you're seeing</Text>

      <View style={styles.categoryGrid}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            style={[
              styles.categoryButton,
              category === cat.key && styles.categoryButtonSelected,
            ]}
            onPress={() => setCategory(cat.key)}
          >
            <Text
              style={[
                styles.categoryButtonText,
                category === cat.key && styles.categoryButtonTextSelected,
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Location</Text>
      <TouchableOpacity
        style={styles.locationButton}
        onPress={captureLocation}
        disabled={locating}
      >
        {locating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.locationButtonText}>
            {location ? '📍 Location Captured — Tap to Refresh' : '📍 Capture My Location'}
          </Text>
        )}
      </TouchableOpacity>
      {location && (
        <Text style={styles.coordsText}>
          {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
        </Text>
      )}

      <Text style={styles.label}>Photo (optional)</Text>
      {photoUri ? (
        <View style={styles.photoPreviewWrap}>
          <Image source={{ uri: photoUri }} style={styles.photoPreview} />
          <TouchableOpacity style={styles.removePhotoButton} onPress={removePhoto}>
            <Text style={styles.removePhotoText}>✕ Remove</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.photoButtonsRow}>
          <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
            <Text style={styles.photoButtonText}>📷 Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoButton} onPress={pickPhotoFromLibrary}>
            <Text style={styles.photoButtonText}>🖼️ Choose Photo</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        style={styles.textInput}
        multiline
        numberOfLines={4}
        placeholder="Anything responders should know — e.g. size, what's burning, people nearby"
        value={description}
        onChangeText={setDescription}
      />

      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Submit Report</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  scrollContainer: {
    flexGrow: 1,
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 60,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  subheader: {
    fontSize: 15,
    color: '#666',
    marginBottom: 20,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  categoryButton: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    width: '47%',
  },
  categoryButtonSelected: {
    borderColor: '#d32f2f',
    backgroundColor: '#fdecea',
  },
  categoryButtonText: {
    fontSize: 14,
    color: '#333',
  },
  categoryButtonTextSelected: {
    color: '#d32f2f',
    fontWeight: '600',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  locationButton: {
    backgroundColor: '#1976d2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 6,
  },
  locationButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
  coordsText: {
    color: '#666',
    fontSize: 13,
    marginBottom: 20,
  },
  photoButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  photoButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  photoButtonText: {
    fontSize: 14,
    color: '#333',
  },
  photoPreviewWrap: {
    marginBottom: 24,
  },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    backgroundColor: '#eee',
  },
  removePhotoButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  removePhotoText: {
    color: '#d32f2f',
    fontSize: 13,
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    marginBottom: 28,
    minHeight: 90,
  },
  submitButton: {
    backgroundColor: '#d32f2f',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 40,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  confirmationBox: {
    alignItems: 'center',
  },
  confirmationEmoji: {
    fontSize: 60,
    marginBottom: 16,
  },
  confirmationTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  confirmationText: {
    fontSize: 15,
    color: '#555',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  confirmationId: {
    fontSize: 13,
    color: '#999',
    marginBottom: 30,
  },
  button: {
    backgroundColor: '#1976d2',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 30,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
