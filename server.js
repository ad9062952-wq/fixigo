require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL || 'https://placeholder.supabase.co', process.env.SUPABASE_KEY || 'placeholder');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// --- MIDDLEWARES ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access denied' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

const checkRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Unauthorized role' });
  }
  next();
};

// --- AUTH ROUTES ---
app.post('/register', async (req, res) => {
  const { name, phone, password, role } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const { data, error } = await supabase
    .from('users')
    .insert([{ name, phone, password: hashedPassword, role }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'User registered successfully', user: data });
});

app.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .single();

  if (error || !user) return res.status(400).json({ error: 'User not found' });

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

// --- PROVIDER ROUTES ---
app.post('/provider/register', authenticateToken, checkRole(['provider']), async (req, res) => {
  const { service_type, latitude, longitude } = req.body;
  
  const { data, error } = await supabase
    .from('providers')
    .insert([{ user_id: req.user.id, service_type, latitude, longitude }])
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Provider profile created. Pending admin approval.', provider: data });
});

app.get('/providers/nearby', authenticateToken, checkRole(['customer']), async (req, res) => {
  const { lat, lng, radius = 10 } = req.query;
  
  // Calls the custom PostgreSQL function for Haversine distance
  const { data, error } = await supabase
    .rpc('get_nearby_providers', {
      user_lat: parseFloat(lat),
      user_lon: parseFloat(lng),
      radius_km: parseFloat(radius)
    });

  if (error) return res.status(400).json({ error: error.message });
  res.json({ providers: data });
});

app.post('/provider/update-location', authenticateToken, checkRole(['provider']), async (req, res) => {
  const { latitude, longitude } = req.body;
  
  const { data: provider } = await supabase.from('providers').select('id').eq('user_id', req.user.id).single();
  if (!provider) return res.status(404).json({ error: 'Provider not found' });

  const { error } = await supabase
    .from('locations')
    .upsert({ provider_id: provider.id, latitude, longitude, updated_at: new Date() });

  // Also update provider table
  await supabase.from('providers').update({ latitude, longitude }).eq('id', provider.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Location updated successfully' });
});

// --- BOOKING ROUTES ---
app.post('/booking/create', authenticateToken, checkRole(['customer']), async (req, res) => {
  const { provider_id, service, amount } = req.body;
  
  const { data, error } = await supabase
    .from('bookings')
    .insert([{ user_id: req.user.id, provider_id, service, amount, status: 'pending' }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  
  // Notify provider
  await supabase.from('notifications').insert([{ user_id: provider_id, message: 'New booking request', type: 'booking_request' }]);
  
  res.json({ message: 'Booking created', booking: data });
});

app.post('/booking/accept', authenticateToken, checkRole(['provider']), async (req, res) => {
  const { booking_id } = req.body;
  
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'accepted' })
    .eq('id', booking_id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  
  // Notify customer
  await supabase.from('notifications').insert([{ user_id: data.user_id, message: 'Your booking was accepted', type: 'booking_accepted' }]);

  res.json({ message: 'Booking accepted', booking: data });
});

app.post('/booking/complete', authenticateToken, checkRole(['provider']), async (req, res) => {
  const { booking_id } = req.body;
  
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'completed' })
    .eq('id', booking_id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  
  // Notify customer
  await supabase.from('notifications').insert([{ user_id: data.user_id, message: 'Job completed. Please proceed to payment.', type: 'job_completed' }]);

  res.json({ message: 'Booking completed', booking: data });
});

// --- PAYMENT ROUTES ---
app.post('/payment/generate-qr', authenticateToken, checkRole(['provider']), async (req, res) => {
  const { booking_id, total_amount } = req.body;
  
  const commission = total_amount * 0.10; // 10% platform fee
  const provider_amount = total_amount - commission;
  
  // Generate a mock UPI QR Code URL
  const qr_code = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=fixora@upi&am=${total_amount}`;

  const { data, error } = await supabase
    .from('payments')
    .insert([{ booking_id, total_amount, commission, provider_amount, status: 'pending', qr_code }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Payment QR generated', payment: data });
});

app.post('/payment/confirm', authenticateToken, checkRole(['customer']), async (req, res) => {
  const { payment_id } = req.body;
  
  const { data, error } = await supabase
    .from('payments')
    .update({ status: 'paid' })
    .eq('id', payment_id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Payment confirmed', payment: data });
});

// --- ADMIN ROUTES ---
app.get('/admin/providers', authenticateToken, checkRole(['admin']), async (req, res) => {
  const { data, error } = await supabase.from('providers').select('*, users(name, phone)');
  if (error) return res.status(400).json({ error: error.message });
  res.json({ providers: data });
});

app.post('/admin/approve-provider', authenticateToken, checkRole(['admin']), async (req, res) => {
  const { provider_id } = req.body;
  const { data, error } = await supabase.from('providers').update({ status: 'Approved' }).eq('id', provider_id).select();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Provider approved', provider: data });
});

app.post('/admin/reject-provider', authenticateToken, checkRole(['admin']), async (req, res) => {
  const { provider_id } = req.body;
  const { data, error } = await supabase.from('providers').update({ status: 'Rejected' }).eq('id', provider_id).select();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Provider rejected', provider: data });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Fixora Backend running on port ${PORT}`);
});
