/* ==========================================================================================
 *  REG-LOG FRONTEND APP  -  React (single file, three page resources)
 * ==========================================================================================
 *  PAGE 1  /signup  -> signup.jsx  -> POST /api/auth/signup
 *  PAGE 2  /login   -> login.jsx   -> POST /api/auth/login  (returns the JWT access token)
 *  PAGE 3  /home    -> home page   -> GET  /api/auth/me + GET /api/products (JWT protected)
 *
 *  Data flow:
 *      form -> axios(JSON payload) -> Spring Boot controller -> service -> repository -> MySQL
 *      backend -> { code, message, data } -> page renders the message and the payload
 * ========================================================================================== */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';

/* ------------------------------------------------------------------ *
 * 1. CONFIG
 * ------------------------------------------------------------------ */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const TOKEN_KEY = 'reglog.token';
const USER_KEY = 'reglog.user';

/* ------------------------------------------------------------------ *
 * 2. API CLIENT  (adds the JWT to every protected request)
 * ------------------------------------------------------------------ */
const api = axios.create({ baseURL: API_BASE, timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = readToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.headers['Content-Type'] = 'application/json';
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message =
      error.response?.data?.message ||
      (error.code === 'ERR_NETWORK'
        ? 'Cannot reach the backend. Is the Spring Boot server running on port 8080?'
        : error.message) ||
      'Something went wrong';
    error.friendlyMessage = message;
    if (status === 401 && readToken()) {
      clearSession();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  }
);

/* ------------------------------------------------------------------ *
 * 3. TOKEN + HELPERS
 * ------------------------------------------------------------------ */
function readToken() {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
}

function decodeToken(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(window.atob(payload))));
  } catch {
    return null;
  }
}

function saveSession(token, remember) {
  clearSession();
  const store = remember ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(decodeToken(token) || {}));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function initials(name = '') {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || 'U'
  );
}

function formatPrice(value) {
  const amount = Number(value || 0);
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/* ------------------------------------------------------------------ *
 * 4. AUTH CONTEXT
 * ------------------------------------------------------------------ */
const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [token, setToken] = useState(readToken());
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const claims = useMemo(() => (token ? decodeToken(token) : null), [token]);

  const loadProfile = useCallback(async () => {
    if (!readToken()) {
      setProfile(null);
      return null;
    }
    setLoadingProfile(true);
    try {
      const { data } = await api.get('/auth/me');
      setProfile(data.data);
      return data.data;
    } catch {
      return null;
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      loadProfile();
    } else {
      setProfile(null);
    }
  }, [token, loadProfile]);

  /** PAGE 1 - signup : posts the JSON payload to the backend and returns the answer */
  const signup = useCallback(async (payload) => {
    const { data } = await api.post('/auth/signup', payload);
    return data;
  }, []);

  /** PAGE 2 - login : posts the JSON payload, stores the returned JWT access token */
  const login = useCallback(async (payload, remember = true) => {
    const { data } = await api.post('/auth/login', payload);
    const body = data.data || {};
    if (body.token) {
      saveSession(body.token, remember);
      setToken(body.token);
      setProfile(body.user || null);
    }
    return data;
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      claims,
      role: claims?.role || profile?.role || 'USER',
      username: claims?.username || claims?.sub || profile?.userId || '',
      profile,
      loadingProfile,
      isAuthenticated: Boolean(token),
      signup,
      login,
      logout,
      loadProfile,
      setProfile,
    }),
    [token, claims, profile, loadingProfile, signup, login, logout, loadProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const useAuth = () => useContext(AuthContext);

/* ------------------------------------------------------------------ *
 * 5. SMALL UI PIECES
 * ------------------------------------------------------------------ */
function Field({ label, name, type = 'text', value, onChange, placeholder, error, hint, required }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        className={error ? 'invalid' : ''}
        onChange={(event) => onChange(name, event.target.value)}
      />
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

function PasswordField({ label, name, value, onChange, placeholder, error }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <div className="password-wrap">
        <input
          id={name}
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          className={error ? 'invalid' : ''}
          onChange={(event) => onChange(name, event.target.value)}
        />
        <button type="button" className="toggle-pw" onClick={() => setVisible((v) => !v)}>
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {error ? <span className="err">{error}</span> : null}
    </div>
  );
}

function Brand({ to = '/' }) {
  return (
    <a className="brand" href={to}>
      <span className="brand-mark">R</span>
      Reg·Log
    </a>
  );
}

function Aside({ title, lede, features, footer }) {
  return (
    <aside className="auth-aside">
      <Brand />
      <div>
        <h2>{title}</h2>
        <p className="lede">{lede}</p>
      </div>
      <ul className="feature-list">
        {features.map((feature, index) => (
          <li key={feature.title}>
            <span className="feature-index">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <strong>{feature.title}</strong>
              <span>{feature.text}</span>
            </div>
          </li>
        ))}
      </ul>
      {footer}
    </aside>
  );
}

/* ------------------------------------------------------------------ *
 * 6. PAGE 1  -  SIGN UP  (signup.jsx)
 * ------------------------------------------------------------------ */
const SIGNUP_INITIAL = {
  fullName: '',
  gmail: '',
  phone: '',
  userId: '',
  password: '',
  confirmPassword: '',
  gender: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  role: 'USER',
};

function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState(SIGNUP_INITIAL);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ type: '', message: '' });
  const [submitting, setSubmitting] = useState(false);

  const onChange = (name, value) => {
    setForm((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: '' }));
  };

  const validate = () => {
    const next = {};
    if (!form.fullName.trim()) next.fullName = 'Full name is required';
    if (!/^\S+@\S+\.\S+$/.test(form.gmail)) next.gmail = 'Enter a valid gmail address';
    if (!/^[0-9+\-\s]{8,15}$/.test(form.phone.trim())) next.phone = 'Enter a valid phone number';
    if (!form.userId.trim() || form.userId.trim().length < 3) next.userId = 'User id must be 3+ characters';
    if (form.password.length < 6) next.password = 'Password must be at least 6 characters';
    if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /** the whole signup request payload that travels to the backend as JSON */
  const buildPayload = () => ({
    fullName: form.fullName.trim(),
    gmail: form.gmail.trim(),
    phone: form.phone.trim(),
    userId: form.userId.trim(),
    password: form.password,
    gender: form.gender || null,
    address: form.address.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim() || null,
    pincode: form.pincode.trim() || null,
    role: form.role,
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ type: '', message: '' });
    if (!validate()) {
      setStatus({ type: 'error', message: 'Please fix the highlighted fields.' });
      return;
    }
    setSubmitting(true);
    try {
      const response = await signup(buildPayload());
      setStatus({
        type: 'success',
        message: `${response.message} — account "${response.data.userId}" created. Please log in now.`,
      });
      setTimeout(() => navigate('/login'), 1200);
    } catch (error) {
      setStatus({ type: 'error', message: error.friendlyMessage || 'Signup failed. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <Aside
        title="Create your store account."
        lede="One account unlocks the catalogue, your profile and the order history of a minimal storefront."
        features={[
          { title: 'Sign up in one step', text: 'Full name, gmail, phone and a user id — that is all we need.' },
          { title: 'Your data is hashed', text: 'Passwords are stored as BCrypt hashes in MySQL, never as plain text.' },
          { title: 'JWT secured', text: 'After login you receive a signed access token used for every request.' },
        ]}
        footer={
          <div className="demo-note">
            <b>Already registered?</b> Head to the login page and use the credentials you signed up with.
          </div>
        }
      />

      <main className="auth-main">
        <div className="auth-card wide">
          <h1>Create account</h1>
          <p className="sub">Fill the form below and we will create your account in the MySQL database.</p>

          {status.message ? <div className={`alert alert-${status.type}`}>{status.message}</div> : null}

          <form className="form-grid" onSubmit={handleSubmit} noValidate>
            <div className="section-label">Account</div>

            <Field
              label="Full name"
              name="fullName"
              value={form.fullName}
              onChange={onChange}
              placeholder="Aarav Sharma"
              error={errors.fullName}
              required
            />

            <div className="form-row">
              <Field
                label="Gmail"
                name="gmail"
                type="email"
                value={form.gmail}
                onChange={onChange}
                placeholder="aarav@gmail.com"
                error={errors.gmail}
                required
              />
              <Field
                label="Phone"
                name="phone"
                value={form.phone}
                onChange={onChange}
                placeholder="9876543210"
                error={errors.phone}
                required
              />
            </div>

            <Field
              label="User id"
              name="userId"
              value={form.userId}
              onChange={onChange}
              placeholder="aarav.sharma"
              hint="Used as your username on the login page."
              error={errors.userId}
              required
            />

            <div className="form-row">
              <PasswordField
                label="Password"
                name="password"
                value={form.password}
                onChange={onChange}
                placeholder="Minimum 6 characters"
                error={errors.password}
              />
              <PasswordField
                label="Confirm password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={onChange}
                placeholder="Repeat the password"
                error={errors.confirmPassword}
              />
            </div>

            <div className="section-label">Profile</div>

            <div className="form-row">
              <div className="field">
                <label htmlFor="gender">Gender</label>
                <select id="gender" name="gender" value={form.gender} onChange={(e) => onChange('gender', e.target.value)}>
                  <option value="">Prefer not to say</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="role">Role</label>
                <select id="role" name="role" value={form.role} onChange={(e) => onChange('role', e.target.value)}>
                  <option value="USER">Customer</option>
                  <option value="ADMIN">Administrator</option>
                </select>
                <span className="hint">Admin accounts can manage products.</span>
              </div>
            </div>

            <Field
              label="Address"
              name="address"
              value={form.address}
              onChange={onChange}
              placeholder="221B Baker Street"
              error={errors.address}
            />

            <div className="form-row">
              <Field label="City" name="city" value={form.city} onChange={onChange} placeholder="Bengaluru" />
              <Field label="State" name="state" value={form.state} onChange={onChange} placeholder="Karnataka" />
            </div>

            <Field label="Pincode" name="pincode" value={form.pincode} onChange={onChange} placeholder="560001" />

            <label className="check">
              <input type="checkbox" required />
              <span>I agree to the terms of the store and the privacy policy.</span>
            </label>

            <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
              {submitting ? <span className="spinner" /> : null}
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <div className="auth-foot">
            Already have an account? <Link to="/login">Log in</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 7. PAGE 2  -  LOG IN  (login.jsx)
 * ------------------------------------------------------------------ */
function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ username: '', password: '' });
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ type: '', message: '' });
  const [submitting, setSubmitting] = useState(false);

  const onChange = (name, value) => {
    setForm((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: '' }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setStatus({ type: '', message: '' });

    const next = {};
    if (!form.username.trim()) next.username = 'Username is required';
    if (!form.password) next.password = 'Password is required';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      // username + password travel to the backend as a JSON payload
      const response = await login({ username: form.username.trim(), password: form.password }, remember);
      const token = response.data?.token;
      setStatus({
        type: 'success',
        message: `${response.message} — access token received (${String(token || '').split('.').length} parts).`,
      });
      const redirectTo = location.state?.from || '/home';
      setTimeout(() => navigate(redirectTo, { replace: true }), 600);
    } catch (error) {
      setStatus({ type: 'error', message: error.friendlyMessage || 'Login failed. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemo = (username, password) => {
    setForm({ username, password });
    setStatus({ type: '', message: '' });
  };

  return (
    <div className="auth-page">
      <Aside
        title="Welcome back to the store."
        lede="Sign in to see your profile, your role and the products we keep in stock for you."
        features={[
          { title: 'One request', text: 'Username and password are verified against the MySQL user table.' },
          { title: 'Signed access token', text: 'A JWT built from your username and role is returned on success.' },
          { title: 'Protected home page', text: 'Every profile and catalogue call carries the token.' },
        ]}
        footer={
          <div className="demo-note">
            <b>Demo account:</b> admin / admin@123
            <br />
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => fillDemo('admin', 'admin@123')}>
              Use demo credentials
            </button>
          </div>
        }
      />

      <main className="auth-main">
        <div className="auth-card">
          <h1>Log in</h1>
          <p className="sub">Enter your username and password to continue.</p>

          {status.message ? <div className={`alert alert-${status.type}`}>{status.message}</div> : null}

          <form className="form-grid" onSubmit={handleSubmit} noValidate>
            <Field
              label="Username"
              name="username"
              value={form.username}
              onChange={onChange}
              placeholder="aarav.sharma"
              error={errors.username}
              required
            />
            <PasswordField
              label="Password"
              name="password"
              value={form.password}
              onChange={onChange}
              placeholder="Your password"
              error={errors.password}
            />

            <div className="inline-between">
              <label className="check">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>Keep me signed in</span>
              </label>
              <Link to="/signup" style={{ fontSize: 13.5 }}>
                Create an account
              </Link>
            </div>

            <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
              {submitting ? <span className="spinner" /> : null}
              {submitting ? 'Verifying…' : 'Log in'}
            </button>
          </form>

          <div className="auth-foot">
            New to the store? <Link to="/signup">Create an account</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 8. PAGE 3  -  HOME  (ecommerce home page with profile + role + products)
 * ------------------------------------------------------------------ */
function HomePage() {
  const { profile, role, username, claims, logout, loadingProfile, loadProfile } = useAuth();
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // --- admin only state (POST / PUT / DELETE on /api/products) ---
  const [adminOpen, setAdminOpen] = useState(false);
  const [allProducts, setAllProducts] = useState([]);
  const [draft, setDraft] = useState({
    id: null,
    name: '',
    description: '',
    price: '',
    category: '',
    imageUrl: '',
    stock: 0,
    rating: 4.5,
  });
  const [adminMsg, setAdminMsg] = useState({ type: '', message: '' });
  const [busy, setBusy] = useState(false);

  const fetchProducts = useCallback(async (activeCategory, activeSearch) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (activeCategory && activeCategory !== 'All') params.category = activeCategory;
      if (activeSearch) params.search = activeSearch;
      const { data } = await api.get('/products', { params });
      setProducts(data.data || []);
    } catch (err) {
      setError(err.friendlyMessage || 'Could not load the products.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts(category, search);
  }, [category, search, fetchProducts]);

  useEffect(() => {
    api
      .get('/products/categories')
      .then(({ data }) => setCategories(['All', ...(data.data || [])]))
      .catch(() => setCategories(['All']));
  }, []);

  useEffect(() => {
    if (!profile) loadProfile();
  }, [profile, loadProfile]);

  const addToCart = (product) => {
    setCart((items) => {
      const existing = items.find((item) => item.id === product.id);
      if (existing) {
        return items.map((item) => (item.id === product.id ? { ...item, qty: item.qty + 1 } : item));
      }
      return [...items, { ...product, qty: 1 }];
    });
  };

  /* ---------------- admin helpers (POST / PUT / DELETE) ---------------- */
  const loadAllProducts = useCallback(async () => {
    try {
      const { data } = await api.get('/products');
      setAllProducts(data.data || []);
    } catch {
      setAllProducts([]);
    }
  }, []);

  useEffect(() => {
    if (adminOpen) loadAllProducts();
  }, [adminOpen, loadAllProducts]);

  const updateDraft = (name, value) => setDraft((previous) => ({ ...previous, [name]: value }));

  const startEdit = (product) => {
    setDraft({
      id: product.id,
      name: product.name || '',
      description: product.description || '',
      price: product.price ?? '',
      category: product.category || '',
      imageUrl: product.imageUrl || '',
      stock: product.stock ?? 0,
      rating: product.rating ?? 4.5,
    });
    setAdminMsg({ type: '', message: '' });
  };

  const resetDraft = () =>
    setDraft({ id: null, name: '', description: '', price: '', category: '', imageUrl: '', stock: 0, rating: 4.5 });

  const saveProduct = async (event) => {
    event.preventDefault();
    setAdminMsg({ type: '', message: '' });

    if (!draft.name.trim()) {
      setAdminMsg({ type: 'error', message: 'Product name is required' });
      return;
    }
    if (!draft.price || Number(draft.price) <= 0) {
      setAdminMsg({ type: 'error', message: 'Enter a price greater than 0' });
      return;
    }

    setBusy(true);
    const payload = {
      name: draft.name,
      description: draft.description,
      price: Number(draft.price),
      category: draft.category,
      imageUrl: draft.imageUrl,
      stock: Number(draft.stock),
      rating: Number(draft.rating),
    };
    try {
      const response = draft.id
        ? await api.put(`/products/${draft.id}`, payload)
        : await api.post('/products', payload);
      setAdminMsg({ type: 'success', message: response.message });
      resetDraft();
      await loadAllProducts();
      await fetchProducts(category, search);
    } catch (err) {
      setAdminMsg({ type: 'error', message: err.friendlyMessage || 'Could not save the product.' });
    } finally {
      setBusy(false);
    }
  };

  const removeProduct = async (id) => {
    setBusy(true);
    setAdminMsg({ type: '', message: '' });
    try {
      const response = await api.delete(`/products/${id}`);
      setAdminMsg({ type: 'success', message: response.message });
      if (draft.id === id) resetDraft();
      await loadAllProducts();
      await fetchProducts(category, search);
    } catch (err) {
      setAdminMsg({ type: 'error', message: err.friendlyMessage || 'Could not delete the product.' });
    } finally {
      setBusy(false);
    }
  };

  const cartCount = cart.reduce((total, item) => total + item.qty, 0);
  const displayName = profile?.fullName || claims?.name || username || 'Guest';
  const roleName = (profile?.role || role || 'USER').toUpperCase();
  const isAdmin = roleName === 'ADMIN';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="container header-inner">
          <div className="header-left">
            <Brand />
            <nav className="header-nav">
              <a href="#catalogue">Catalogue</a>
              <a href="#profile">Profile</a>
            </nav>
          </div>

          <div className="header-right">
            {isAdmin ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setAdminOpen((value) => !value)}>
                {adminOpen ? 'Close admin' : 'Admin tools'}
              </button>
            ) : null}
            <span className="cart-pill" title="Items in the cart">
              <span aria-hidden="true">🛒</span> {cartCount}
            </span>
            <span className={`badge ${isAdmin ? 'badge-admin' : 'badge-user'}`}>{roleName}</span>
            <div className="user-chip">
              <span className="avatar">{initials(displayName)}</span>
              <span className="who">
                <b>{displayName}</b>
                <small>@{username}</small>
              </span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="container">
          <p className="eyebrow">Welcome back, {roleName.toLowerCase()}</p>
          <h1>Everything you need, nothing you do not.</h1>
          <p>
            A deliberately small catalogue. Your profile, your role and the products below are fetched from the
            Spring Boot backend with the JWT access token issued at login.
          </p>
          <div className="hero-actions">
            <a className="btn btn-primary" href="#catalogue">
              Browse the catalogue
            </a>
            <button className="btn btn-ghost" onClick={() => loadProfile()}>
              Refresh profile
            </button>
          </div>
        </div>
      </section>

      <main className="container home-grid">
        <aside className="card profile-card" id="profile">
          <div className="profile-head">
            <span className="avatar">{initials(displayName)}</span>
            <div>
              <b>{displayName}</b>
              <small>@{username}</small>
            </div>
          </div>

          {loadingProfile && !profile ? (
            <p className="hint" style={{ marginTop: 16 }}>
              Loading profile…
            </p>
          ) : (
            <dl className="profile-list">
              <div>
                <dt>Gmail</dt>
                <dd>{profile?.gmail || '—'}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{profile?.phone || '—'}</dd>
              </div>
              <div>
                <dt>User id</dt>
                <dd>{profile?.userId || username || '—'}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>
                  <span className={`badge ${isAdmin ? 'badge-admin' : 'badge-user'}`}>{roleName}</span>
                </dd>
              </div>
              <div>
                <dt>City</dt>
                <dd>
                  {profile?.city || '—'}
                  {profile?.state ? `, ${profile.state}` : ''}
                </dd>
              </div>
              <div>
                <dt>Member since</dt>
                <dd>{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN') : '—'}</dd>
              </div>
            </dl>
          )}
        </aside>

        <section id="catalogue">
          <div className="section-head">
            <div>
              <h2>Product catalogue</h2>
              <p>{products.length} products available right now.</p>
            </div>
          </div>

          <div className="toolbar">
            <div className="search">
              <span className="icon" aria-hidden="true">
                ⌕
              </span>
              <input
                value={search}
                placeholder="Search products…"
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search products"
              />
            </div>
            <div className="chips">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`chip ${category === item ? 'active' : ''}`}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {error ? <div className="alert alert-error">{error}</div> : null}

          {loading ? (
            <div className="loading-screen">
              <span className="dot-loader" />
            </div>
          ) : products.length === 0 ? (
            <div className="empty">
              <p>No products match your search.</p>
            </div>
          ) : (
            <div className="product-grid">
              {products.map((product) => (
                <article className="product-card" key={product.id}>
                  <div className="product-media">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} loading="lazy" />
                    ) : (
                      <span className="product-cat">No image</span>
                    )}
                  </div>
                  <div className="product-body">
                    <span className="product-cat">{product.category}</span>
                    <h3 className="product-name">{product.name}</h3>
                    <p className="product-desc">{product.description}</p>
                    <div className="product-foot">
                      <span className="price">{formatPrice(product.price)}</span>
                      <span className="rating">★ {Number(product.rating || 0).toFixed(1)}</span>
                    </div>
                    <div className="inline-between">
                      {product.stock > 0 ? (
                        <span className="rating">{product.stock} in stock</span>
                      ) : (
                        <span className="stock-out">Out of stock</span>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => addToCart(product)}
                        disabled={product.stock <= 0}
                      >
                        Add to cart
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {isAdmin && adminOpen ? (
          <section className="card admin-panel">
            <div className="section-head">
              <div>
                <h2>Product manager</h2>
                <p>Create, update and delete catalogue entries — POST / PUT / DELETE /api/products.</p>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={resetDraft}>
                New product
              </button>
            </div>

            {adminMsg.message ? <div className={`alert alert-${adminMsg.type}`}>{adminMsg.message}</div> : null}

            <div className="admin-grid">
              <form className="form-grid" onSubmit={saveProduct}>
                <div className="section-label">{draft.id ? `Editing #${draft.id}` : 'New product'}</div>
                <Field label="Name" name="name" value={draft.name} onChange={updateDraft} placeholder="Canvas Backpack" />
                <Field
                  label="Description"
                  name="description"
                  value={draft.description}
                  onChange={updateDraft}
                  placeholder="Short description"
                />
                <div className="form-row">
                  <Field label="Price" name="price" value={draft.price} onChange={updateDraft} placeholder="1999" />
                  <Field label="Category" name="category" value={draft.category} onChange={updateDraft} placeholder="Accessories" />
                </div>
                <div className="form-row">
                  <Field label="Stock" name="stock" value={draft.stock} onChange={updateDraft} placeholder="25" />
                  <Field label="Rating" name="rating" value={draft.rating} onChange={updateDraft} placeholder="4.5" />
                </div>
                <Field
                  label="Image url"
                  name="imageUrl"
                  value={draft.imageUrl}
                  onChange={updateDraft}
                  placeholder="https://…"
                />
                <div className="inline-between">
                  <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                    {draft.id ? 'Update product' : 'Create product'}
                  </button>
                  {draft.id ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={resetDraft}>
                      Cancel
                    </button>
                  ) : null}
                </div>
              </form>

              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {allProducts.map((product) => (
                      <tr key={product.id}>
                        <td>{product.id}</td>
                        <td>{product.name}</td>
                        <td>{product.category}</td>
                        <td>{formatPrice(product.price)}</td>
                        <td>{product.stock}</td>
                        <td>
                          <div className="row-actions">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(product)}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm danger-btn"
                              onClick={() => removeProduct(product.id)}
                              disabled={busy}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="app-footer">
        <div className="container footer-inner">
          <span>REG·LOG — Spring Boot + MySQL + React</span>
          <span>
            Signed in as <b>{username}</b> with role <b>{roleName}</b>
          </span>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 9. ROUTING + PROTECTED ROUTES
 * ------------------------------------------------------------------ */
function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

function RedirectIfLoggedIn({ children }) {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) {
    return <Navigate to="/home" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/home" replace />} />
      <Route
        path="/signup"
        element={
          <RedirectIfLoggedIn>
            <SignupPage />
          </RedirectIfLoggedIn>
        }
      />
      <Route
        path="/login"
        element={
          <RedirectIfLoggedIn>
            <LoginPage />
          </RedirectIfLoggedIn>
        }
      />
      <Route
        path="/home"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
