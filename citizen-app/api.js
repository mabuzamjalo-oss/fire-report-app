import axios from 'axios';

// IMPORTANT: 'localhost' won't work from a physical phone — it refers to
// the phone itself, not your PC. Replace this with your PC's local network
// IP address (find it on Windows with `ipconfig`, look for IPv4 Address).
// Example: 'http://192.168.1.42:4000/api'
const API_BASE_URL = 'http://51.21.160.7:4000/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

export async function uploadPhoto(uri) {
  const formData = new FormData();
  const filename = uri.split('/').pop();
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';

  formData.append('photo', { uri, name: filename, type });

  const response = await api.post('/uploads', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data.url;
}

export async function submitIncident({ category, latitude, longitude, description, photo_urls }) {
  const response = await api.post('/incidents', {
    category,
    latitude,
    longitude,
    description,
    photo_urls,
  });
  return response.data;
}

export async function getIncidents() {
  const response = await api.get('/incidents');
  return response.data;
}

export default api;
