import React, { useState, useEffect } from 'react';
import { Lock, Save, RotateCcw, LogOut, Eye, EyeOff, Mail, Key, Smartphone, QrCode, MessageSquare, Brain, Settings, CheckCircle, XCircle, AlertTriangle, Trash2, Users, FileText, Lightbulb, Activity, BarChart2, TrendingUp, ChevronDown, ChevronRight, Phone, Globe } from 'lucide-react';
import { storageService, fetchCsrfToken } from '../services/storageService';
import { NO_KNOWLEDGE_FALLBACK } from '../constants';

interface AdminPanelProps {
  onClose: () => void;
}

type AuthStep = 'login' | '2fa_verify' | '2fa_setup' | 'forgot_password' | 'reset_password';
type AdminTab = 'knowledge' | 'logs' | 'learning' | 'suggestions' | 'team' | 'settings' | 'stats' | 'pending' | 'analytics' | 'phone' | 'health';

const AdminPanel: React.FC<AdminPanelProps> = ({ onClose }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>('login');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('stats');

  // Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Reset Password State
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Data State
  const [knowledgeBase, setKnowledgeBase] = useState<any | null>(null);
  const [activeSection, setActiveSection] = useState<string>('official_ticketing');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Admin Features State
  const [logs, setLogs] = useState<any[]>([]);
  const [expandedConvos, setExpandedConvos] = useState<Set<string>>(new Set());
  const [softKnowledge, setSoftKnowledge] = useState<string[]>([]);
  const [config, setConfig] = useState<any>({});
  const [newKnowledgeItem, setNewKnowledgeItem] = useState('');

  // New Features State
  const [structuredKB, setStructuredKB] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [phoneStatus, setPhoneStatus] = useState<any>(null);
  const [phoneStatusLoading, setPhoneStatusLoading] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [securityData, setSecurityData] = useState<any>(null);

  // UI State for Forms
  const [editingKBItem, setEditingKBItem] = useState<any | null>(null);
  const [isEditingKB, setIsEditingKB] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('Viewer');

  useEffect(() => {
    checkAuth();

    // Check for reset token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      setResetToken(token);
      setAuthStep('reset_password');
    }
  }, []);

  const checkAuth = async () => {
    const isAuth = await storageService.checkAuth();
    setIsAuthenticated(isAuth);
    if (isAuth) {
      await fetchCsrfToken(); // Fetch CSRF token before loading data
      loadAllData();
    }
    setIsLoading(false);
  };

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [kbData, logsData, skData, configData, structKB, suggs, pending, usrs, actLogs, statsData, analyticsData] = await Promise.all([
        storageService.getStoredKnowledge(),
        storageService.getLogs(),
        storageService.getSoftKnowledge(),
        storageService.getConfig(),
        storageService.getKnowledgeBase(),
        storageService.getSuggestions(),
        storageService.getPendingKnowledge(),
        storageService.getUsers(),
        storageService.getActivityLogs(),
        storageService.getStatsSummary(),
        fetch('/api/admin/analytics', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null)
      ]);

      setKnowledgeBase(kbData);
      setLogs(logsData);
      setSoftKnowledge(skData);
      setConfig(configData);
      setStructuredKB(structKB);
      setSuggestions(suggs);
      setPendingItems(pending);
      setUsers(usrs);
      setActivityLogs(actLogs);
      setStats(statsData);
      setAnalytics(analyticsData);
    } catch (e) {
      console.error("Failed to load admin data", e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPhoneStatus = async () => {
    setPhoneStatusLoading(true);
    try {
      const data = await fetch('/api/admin/phone-status', { credentials: 'include' }).then(r => r.ok ? r.json() : null);
      setPhoneStatus(data);
    } catch (e) {
      console.error("Failed to load phone status", e);
    } finally {
      setPhoneStatusLoading(false);
    }
  };

  const loadHealthData = async () => {
    setHealthLoading(true);
    try {
      const [health, security] = await Promise.all([
        fetch('/api/admin/health', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
        fetch('/api/admin/security', { credentials: 'include' }).then(r => r.ok ? r.json() : null),
      ]);
      setHealthData(health);
      setSecurityData(security);
    } catch (e) {
      console.error("Failed to load health data", e);
    } finally {
      setHealthLoading(false);
    }
  };

  // Auto-refresh phone status when on phone tab
  useEffect(() => {
    if (isAuthenticated && activeTab === 'phone') {
      loadPhoneStatus();
      const interval = setInterval(loadPhoneStatus, 30000); // Refresh every 30s
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, activeTab]);

  // Auto-refresh health data when on health tab
  useEffect(() => {
    if (isAuthenticated && activeTab === 'health') {
      loadHealthData();
      const interval = setInterval(loadHealthData, 60000); // Refresh every 60s
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, activeTab]);

  const handleReviewPending = async (id: string, action: 'approve' | 'reject') => {
    try {
      await storageService.reviewPendingKnowledge(id, action);
      // Refresh pending items
      const pending = await storageService.getPendingKnowledge();
      setPendingItems(pending);
      // If approved, also refresh soft knowledge
      if (action === 'approve') {
        const skData = await storageService.getSoftKnowledge();
        setSoftKnowledge(skData);
      }
    } catch (e) {
      console.error("Failed to review pending item", e);
      // Removed alert to prevent Chrome flickering
    }
  };

  // --- AUTH HANDLERS ---

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoading(true);

    try {
      const result = await storageService.login(email, password);
      setTempToken(result.tempToken);

      if (result.require2fa) {
        setAuthStep('2fa_verify');
      } else if (result.setup2fa) {
        // Fetch QR Code
        const setupData = await storageService.setup2FA(result.tempToken);
        setQrCodeUrl(setupData.qrCode);
        setAuthStep('2fa_setup');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FAVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoading(true);

    const success = await storageService.verify2FA(tempToken, twoFactorCode);
    if (success) {
      setIsAuthenticated(true);
      await fetchCsrfToken(); // Fetch CSRF token after 2FA success
      loadAllData();
    } else {
      setAuthError('Invalid 2FA code');
    }
    setIsLoading(false);
  };

  const handle2FASetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsLoading(true);

    const success = await storageService.verify2FASetup(tempToken, twoFactorCode);
    if (success) {
      setIsAuthenticated(true);
      await fetchCsrfToken(); // Fetch CSRF token after 2FA setup
      loadAllData();
    } else {
      setAuthError('Invalid code. Please scan the QR code and try again.');
    }
    setIsLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    await storageService.forgotPassword(email);
    setAuthError('If an account exists, a reset link has been sent.');
    setIsLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setAuthError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    const success = await storageService.resetPassword(resetToken, newPassword);
    if (success) {
      setAuthStep('login');
      setAuthError('Password reset successful. Please login.');
      // Clear URL param
      window.history.replaceState({}, document.title, "/");
    } else {
      setAuthError('Failed to reset password. Token may be expired.');
    }
    setIsLoading(false);
  };

  const handleLogout = async () => {
    await storageService.logout();
    setIsAuthenticated(false);
    setEmail('');
    setPassword('');
    setAuthStep('login');
  };

  // --- DATA HANDLERS ---

  const handleSave = async () => {
    if (!knowledgeBase) return;
    setSaveStatus('saving');
    const success = await storageService.saveStoredKnowledge(knowledgeBase);
    if (success) {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } else {
      setSaveStatus('error');
    }
  };

  const handleFeedback = async (id: string, feedback: 'correct' | 'incorrect' | 'needs_improvement') => {
    await storageService.sendFeedback(id, feedback);
    // Optimistic update
    setLogs(prev => prev.map(log => log.id === id ? { ...log, feedback } : log));
  };

  const handleAddSoftKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKnowledgeItem.trim()) return;

    await storageService.addSoftKnowledge(newKnowledgeItem);
    setSoftKnowledge(prev => [...prev, newKnowledgeItem]);
    setNewKnowledgeItem('');
  };

  const handleDeleteSoftKnowledge = async (index: number) => {
    await storageService.deleteSoftKnowledge(index);
    setSoftKnowledge(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfigChange = async (key: string, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    await storageService.updateConfig(newConfig);
  };

  // KB Handlers
  const handleSaveKBItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKBItem) return;

    if (editingKBItem.id) {
      await storageService.updateKnowledgeBaseItem(editingKBItem.id, editingKBItem);
      setStructuredKB(prev => prev.map(item => item.id === editingKBItem.id ? editingKBItem : item));
    } else {
      await storageService.addKnowledgeBaseItem({ ...editingKBItem, created_by: 'admin' });
      const newKB = await storageService.getKnowledgeBase();
      setStructuredKB(newKB);
    }
    setIsEditingKB(false);
    setEditingKBItem(null);
  };

  const handleDeleteKBItem = async (id: string) => {
    // Removed confirm to prevent Chrome flickering
    await storageService.deleteKnowledgeBaseItem(id);
    setStructuredKB(prev => prev.filter(item => item.id !== id));
  };

  // Suggestion Handlers
  const handleSuggestionAction = async (id: string, status: 'approved' | 'rejected') => {
    await storageService.updateSuggestionStatus(id, status);
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status } : s));

    if (status === 'approved') {
      const suggestion = suggestions.find(s => s.id === id);
      if (suggestion) {
        // Add to KB automatically
        await storageService.addKnowledgeBaseItem({
          category: 'FAQs',
          title: suggestion.trigger_question,
          content: suggestion.suggested_content,
          tags: ['auto-learned'],
          confidence_score: 'medium',
          created_by: 'auto-learning'
        });
        const newKB = await storageService.getKnowledgeBase();
        setStructuredKB(newKB);
      }
    }
  };

  // User Handlers
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await storageService.addUser({ email: newUserEmail, role: newUserRole });
      const newUsers = await storageService.getUsers();
      setUsers(newUsers);
      setNewUserEmail('');
      // Success feedback without alert
      setAuthError('User added successfully.');
      setTimeout(() => setAuthError(''), 3000);
    } catch (error: any) {
      setAuthError(error.message || 'Failed to add user');
    }
  };

  const handleDeleteUser = async (id: string) => {
    // Removed confirm to prevent Chrome flickering
    await storageService.deleteUser(id);
    setUsers(prev => prev.filter(u => u.id !== id));
  };

  const handleResetDefaults = async () => {
    // Removed confirm to prevent Chrome flickering
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white p-8 rounded-xl shadow-2xl animate-pulse">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // --- RENDER AUTH VIEWS ---

  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
          <div className="bg-emerald-900 p-6 text-white flex justify-between items-center">
            <h2 className="text-xl font-serif flex items-center gap-2">
              <Lock size={20} />
              Admin Access
            </h2>
            <button onClick={onClose} className="text-emerald-100 hover:text-white">✕</button>
          </div>

          <div className="p-8">
            {/* LOGIN STEP */}
            {authStep === 'login' && (
              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      placeholder="Enter your email"
                      required
                      autoComplete="off"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                      placeholder="••••••••"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setAuthStep('forgot_password')}
                    className="text-sm text-emerald-600 hover:text-emerald-700"
                  >
                    Forgot Password?
                  </button>
                </div>

                {authError && (
                  <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-emerald-900 text-white py-2 rounded-lg hover:bg-emerald-800 transition-colors font-medium disabled:opacity-50"
                >
                  {isLoading ? 'Verifying...' : 'Sign In'}
                </button>
              </form>
            )}

            {/* 2FA VERIFY STEP */}
            {authStep === '2fa_verify' && (
              <form onSubmit={handle2FAVerify} className="space-y-6">
                <div className="text-center mb-6">
                  <div className="bg-emerald-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Smartphone className="text-emerald-600" size={32} />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">Two-Factor Authentication</h3>
                  <p className="text-sm text-gray-500 mt-1">Enter the code from your authenticator app</p>
                </div>

                <div>
                  <input
                    type="text"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full text-center text-2xl tracking-[0.5em] py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                  />
                </div>

                {authError && (
                  <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 text-center">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-emerald-900 text-white py-2 rounded-lg hover:bg-emerald-800 transition-colors font-medium"
                >
                  Verify
                </button>

                <button
                  type="button"
                  onClick={() => setAuthStep('login')}
                  className="w-full text-sm text-gray-500 hover:text-gray-700"
                >
                  Back to Login
                </button>
              </form>
            )}

            {/* 2FA SETUP STEP */}
            {authStep === '2fa_setup' && (
              <form onSubmit={handle2FASetup} className="space-y-6">
                <div className="text-center mb-4">
                  <div className="bg-emerald-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <QrCode className="text-emerald-600" size={32} />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">Setup 2FA</h3>
                  <p className="text-sm text-gray-500 mt-1">Scan this QR code with Google Authenticator</p>
                </div>

                <div className="flex justify-center mb-4">
                  {qrCodeUrl && <img src={qrCodeUrl} alt="2FA QR Code" className="border p-2 rounded-lg w-64 h-64" />}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-center">Enter the 6-digit code to confirm</label>
                  <input
                    type="text"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full text-center text-2xl tracking-[0.5em] py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>

                {authError && (
                  <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 text-center">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-emerald-900 text-white py-2 rounded-lg hover:bg-emerald-800 transition-colors font-medium"
                >
                  Enable 2FA & Login
                </button>
              </form>
            )}

            {/* FORGOT PASSWORD STEP */}
            {authStep === 'forgot_password' && (
              <form onSubmit={handleForgotPassword} className="space-y-6">
                <div className="text-center mb-6">
                  <h3 className="text-lg font-medium text-gray-900">Reset Password</h3>
                  <p className="text-sm text-gray-500 mt-1">Enter your email to receive a reset link</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    placeholder="admin@ognissantihotels.com"
                    required
                  />
                </div>

                {authError && (
                  <div className="p-3 bg-blue-50 text-blue-600 text-sm rounded-lg border border-blue-100">
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-emerald-900 text-white py-2 rounded-lg hover:bg-emerald-800 transition-colors font-medium"
                >
                  Send Reset Link
                </button>

                <button
                  type="button"
                  onClick={() => setAuthStep('login')}
                  className="w-full text-sm text-gray-500 hover:text-gray-700"
                >
                  Back to Login
                </button>
              </form>
            )}

            {/* RESET PASSWORD STEP */}
            {authStep === 'reset_password' && (
              <form onSubmit={handleResetPassword} className="space-y-6">
                <div className="text-center mb-6">
                  <h3 className="text-lg font-medium text-gray-900">Set New Password</h3>
                  <p className="text-sm text-gray-500 mt-1">Enter your new password below</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                    required
                  />
                </div>

                {authError && (
                  <div className={`p-3 text-sm rounded-lg border ${authError.includes('successful') ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                    {authError}
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full bg-emerald-900 text-white py-2 rounded-lg hover:bg-emerald-800 transition-colors font-medium"
                >
                  Reset Password
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // --- MAIN ADMIN UI (Authenticated) ---

  return (
    <div className="fixed inset-0 bg-gray-100 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-emerald-900 text-white px-4 md:px-6 py-3 md:py-4 shadow-md">
        {/* Top row - Logo and actions */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 md:gap-3">
            <Lock size={20} className="text-emerald-300 md:w-6 md:h-6" />
            <div>
              <h1 className="text-lg md:text-xl font-serif font-medium">Admin Panel</h1>
              <p className="text-[10px] md:text-xs text-emerald-300 hidden sm:block">System Management</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {activeTab === 'knowledge' && (
              <button
                onClick={handleSave}
                disabled={saveStatus === 'saving'}
                className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 rounded-lg transition-all text-sm ${saveStatus === 'saved'
                  ? 'bg-green-500 text-white'
                  : saveStatus === 'error'
                    ? 'bg-red-500 text-white'
                    : 'bg-emerald-700 hover:bg-emerald-600 text-white'
                  }`}
              >
                <Save size={16} className="md:w-[18px] md:h-[18px]" />
                <span className="hidden sm:inline">{saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save'}</span>
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 bg-emerald-800 hover:bg-emerald-700 rounded-lg transition-colors text-white/90 text-sm"
            >
              <LogOut size={16} className="md:w-[18px] md:h-[18px]" />
              <span className="hidden sm:inline">Logout</span>
            </button>
            <button onClick={onClose} className="text-white/70 hover:text-white p-1">✕</button>
          </div>
        </div>

        {/* Tabs - scrollable on mobile */}
        <div className="mt-3 -mx-4 md:mx-0 px-4 md:px-0 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1 bg-emerald-800/50 p-1 rounded-lg min-w-max md:min-w-0 md:flex-wrap md:justify-center">
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'stats' ? 'bg-white text-emerald-900 shadow-sm' : 'text-emerald-100 hover:text-white'}`}
            >
              Stats
            </button>
            <button
              onClick={() => setActiveTab('knowledge')}
              className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'knowledge' ? 'bg-white text-emerald-900 shadow-sm' : 'text-emerald-100 hover:text-white'}`}
            >
              Knowledge
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'pending' ? 'bg-white text-emerald-900 shadow-sm' : 'text-emerald-100 hover:text-white'}`}
            >
              Pending ({pendingItems.length})
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'logs' ? 'bg-white text-emerald-900 shadow-sm' : 'text-emerald-100 hover:text-white'}`}
            >
              Logs
            </button>
            <button
              onClick={() => setActiveTab('learning')}
              className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'learning' ? 'bg-white text-emerald-900 shadow-sm' : 'text-emerald-100 hover:text-white'}`}
            >
              Learning
            </button>
            <button
              onClick={() => setActiveTab('suggestions')}
              className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'suggestions' ? 'bg-white text-emerald-900 shadow-sm' : 'text-emerald-100 hover:text-white'}`}
            >
              Suggestions
            </button>
            <button
              onClick={() => setActiveTab('team')}
              className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'team' ? 'bg-white text-emerald-900 shadow-sm' : 'text-emerald-100 hover:text-white'}`}
            >
              Team
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'settings' ? 'bg-white text-emerald-900 shadow-sm' : 'text-emerald-100 hover:text-white'}`}
            >
              Settings
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'analytics' ? 'bg-white text-emerald-900 shadow-sm' : 'text-emerald-100 hover:text-white'}`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('phone')}
              className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'phone' ? 'bg-white text-emerald-900 shadow-sm' : 'text-emerald-100 hover:text-white'}`}
            >
              <Phone size={14} className="inline mr-1" />
              Phone
            </button>
            <button
              onClick={() => setActiveTab('health')}
              className={`px-3 md:px-4 py-1.5 rounded-md text-xs md:text-sm font-medium transition-colors whitespace-nowrap ${activeTab === 'health' ? 'bg-white text-emerald-900 shadow-sm' : 'text-emerald-100 hover:text-white'}`}
            >
              <Activity size={14} className="inline mr-1" />
              Health
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">

        {/* KNOWLEDGE BASE TAB */}
        {activeTab === 'knowledge' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-5xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                <h2 className="text-xl md:text-2xl font-bold text-gray-800">Knowledge Base</h2>
                <button
                  onClick={() => { setEditingKBItem({ category: 'FAQs', confidence_score: 'high', tags: [] }); setIsEditingKB(true); }}
                  className="bg-emerald-600 text-white px-3 md:px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center gap-2 text-sm md:text-base w-full sm:w-auto justify-center"
                >
                  <FileText size={18} /> Add New Item
                </button>
              </div>

              {isEditingKB ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6">
                  <h3 className="text-lg font-medium mb-4">{editingKBItem.id ? 'Edit Item' : 'New Item'}</h3>
                  <form onSubmit={handleSaveKBItem} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                        <input
                          type="text"
                          value={editingKBItem.title || ''}
                          onChange={e => setEditingKBItem({ ...editingKBItem, title: e.target.value })}
                          className="w-full p-2 border rounded-md"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select
                          value={editingKBItem.category || 'FAQs'}
                          onChange={e => setEditingKBItem({ ...editingKBItem, category: e.target.value })}
                          className="w-full p-2 border rounded-md"
                        >
                          <option value="Properties">Properties</option>
                          <option value="Services">Services</option>
                          <option value="Instructions">Instructions</option>
                          <option value="FAQs">FAQs</option>
                          <option value="Policies">Policies</option>
                          <option value="Custom">Custom</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                      <textarea
                        value={editingKBItem.content || ''}
                        onChange={e => setEditingKBItem({ ...editingKBItem, content: e.target.value })}
                        className="w-full p-2 border rounded-md h-32"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma separated)</label>
                        <input
                          type="text"
                          value={editingKBItem.tags ? editingKBItem.tags.join(', ') : ''}
                          onChange={e => setEditingKBItem({ ...editingKBItem, tags: e.target.value.split(',').map((t: string) => t.trim()) })}
                          className="w-full p-2 border rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Confidence Score</label>
                        <select
                          value={editingKBItem.confidence_score || 'medium'}
                          onChange={e => setEditingKBItem({ ...editingKBItem, confidence_score: e.target.value })}
                          className="w-full p-2 border rounded-md"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4">
                      <button type="button" onClick={() => setIsEditingKB(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md order-2 sm:order-1">Cancel</button>
                      <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 order-1 sm:order-2">Save Item</button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="grid gap-4">
                  {structuredKB.map((item) => (
                    <div key={item.id} className="bg-white p-3 md:p-4 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.category === 'Policies' ? 'bg-red-100 text-red-700' :
                              item.category === 'Services' ? 'bg-blue-100 text-blue-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                              {item.category}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${item.confidence_score === 'high' ? 'bg-green-100 text-green-700' :
                              item.confidence_score === 'low' ? 'bg-yellow-100 text-yellow-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                              {item.confidence_score}
                            </span>
                          </div>
                          <h3 className="font-medium text-base md:text-lg text-gray-900">{item.title}</h3>
                          <p className="text-gray-600 mt-1 line-clamp-2 text-sm">{item.content}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {item.tags && item.tags.map((tag: string, i: number) => (
                              <span key={i} className="text-xs text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">#{tag}</span>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 self-end sm:self-start">
                          <button onClick={() => { setEditingKBItem(item); setIsEditingKB(true); }} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full">
                            <Settings size={18} />
                          </button>
                          <button onClick={() => handleDeleteKBItem(item.id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {structuredKB.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      <Brain size={48} className="mx-auto mb-4 text-gray-300" />
                      <p>No knowledge base items yet. Add one to get started.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PENDING KNOWLEDGE TAB */}
        {activeTab === 'pending' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8">
            <div className="max-w-5xl mx-auto">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-gray-800">Pending Knowledge</h2>
                  <p className="text-gray-500 text-sm mt-1">Review and approve knowledge proposed by the AI.</p>
                </div>
              </div>

              {pendingItems.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                  <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="text-gray-400" size={32} />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">All Caught Up</h3>
                  <p className="text-gray-500 mt-1">There are no pending knowledge items to review.</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {pendingItems.map((item) => (
                    <div key={item.id} className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-200">
                      <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium uppercase tracking-wide">
                              {item.category}
                            </span>
                            <span className="text-xs text-gray-400">
                              {new Date(item.timestamp || item.created_at).toLocaleString()}
                            </span>
                          </div>

                          <h3 className="text-lg font-medium text-gray-900 mb-2">{item.key}</h3>

                          <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 mb-3">
                            <p className="text-gray-700 whitespace-pre-wrap">{item.value}</p>
                          </div>

                          <div className="flex items-start gap-2 text-sm text-gray-500 bg-blue-50 p-3 rounded-lg border border-blue-100">
                            <Brain size={16} className="text-blue-500 mt-0.5 shrink-0" />
                            <div>
                              <span className="font-medium text-blue-700">AI Reasoning:</span> {item.reasoning}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-row md:flex-col gap-2 justify-end md:justify-start md:w-32 shrink-0">
                          <button
                            onClick={() => handleReviewPending(item.id, 'approve')}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
                          >
                            <CheckCircle size={16} />
                            Approve
                          </button>
                          <button
                            onClick={() => handleReviewPending(item.id, 'reject')}
                            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium"
                          >
                            <XCircle size={16} />
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* LOGS TAB */}
        {activeTab === 'logs' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
            <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl md:text-2xl font-serif font-medium text-gray-900">Conversations</h2>
                <span className="text-xs md:text-sm text-gray-500">{logs.length} conversations</span>
              </div>

              <div className="space-y-3">
                {logs.map((conv: any) => {
                  const isExpanded = expandedConvos.has(conv.id);
                  const msgCount = conv.messages?.length || 1;
                  const channels = conv.channels || [conv.channel || 'web'];
                  const isMultiChannel = channels.length > 1;
                  const hasPhone = channels.includes('phone');
                  const hasWhatsApp = channels.includes('whatsapp');
                  const hasWeb = channels.includes('web');
                  const primaryChannel = hasPhone ? 'phone' : hasWhatsApp ? 'whatsapp' : 'web';

                  // Icon and color based on primary channel
                  const iconBg = hasPhone ? 'bg-orange-100' : hasWhatsApp ? 'bg-green-100' : 'bg-blue-100';
                  const iconColor = hasPhone ? 'text-orange-600' : hasWhatsApp ? 'text-green-600' : 'text-blue-600';

                  // Display name
                  const displayName = conv.contactName || (conv.phone ? `Guest (${conv.phone})` : 'Web Chat');

                  return (
                    <div key={conv.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => {
                          setExpandedConvos(prev => {
                            const next = new Set(prev);
                            if (next.has(conv.id)) next.delete(conv.id);
                            else next.add(conv.id);
                            return next;
                          });
                        }}
                        className="w-full p-4 md:px-6 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                          {hasPhone ? <Phone size={14} className={iconColor} /> : hasWhatsApp ? <MessageSquare size={14} className={iconColor} /> : <Globe size={14} className={iconColor} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-900 truncate">
                              {displayName}
                            </span>
                            {/* Channel badges */}
                            {hasPhone && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">
                                Phone
                              </span>
                            )}
                            {hasWhatsApp && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                                WhatsApp
                              </span>
                            )}
                            {hasWeb && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
                                Web
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 truncate mt-0.5">
                            {conv.messages?.[0]?.userMessage || conv.userMessage || '...'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-xs text-gray-400">{msgCount} msg{msgCount !== 1 ? 's' : ''}</span>
                          <span className="text-xs text-gray-400">{new Date(conv.lastMessageAt || conv.startedAt).toLocaleString()}</span>
                          {isExpanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-100 p-4 md:px-6 space-y-3 bg-gray-50/50">
                          {(conv.messages || [{ userMessage: conv.userMessage, aiResponse: conv.aiResponse, id: conv.id, timestamp: conv.startedAt, feedback: conv.feedback }]).map((msg: any) => {
                            const msgChannel = msg.channel || conv.channel || 'web';
                            const channelIcon = msgChannel === 'phone' ? '📞' : msgChannel === 'whatsapp' ? '💬' : '🌐';
                            return (
                            <div key={msg.id} className="space-y-2">
                              <div className="flex gap-2">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                  msgChannel === 'phone' ? 'bg-orange-100' : msgChannel === 'whatsapp' ? 'bg-green-100' : 'bg-gray-200'
                                }`}>
                                  <span className={`text-[10px] font-bold ${
                                    msgChannel === 'phone' ? 'text-orange-600' : msgChannel === 'whatsapp' ? 'text-green-600' : 'text-gray-500'
                                  }`}>U</span>
                                </div>
                                <div className={`p-2 md:p-3 rounded-lg rounded-tl-none text-xs md:text-sm text-gray-800 flex-1 border ${
                                  msgChannel === 'phone' ? 'bg-orange-50 border-orange-200' : msgChannel === 'whatsapp' ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                                }`}>
                                  {msg.userMessage}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <span className="text-[10px] font-bold text-emerald-600">S</span>
                                </div>
                                <div className="bg-emerald-50/50 p-2 md:p-3 rounded-lg rounded-tl-none text-xs md:text-sm text-gray-800 flex-1 border border-emerald-100">
                                  {msg.aiResponse}
                                </div>
                              </div>
                              <div className="flex justify-between items-center pl-8">
                                <div className="flex items-center gap-2">
                                  <span className="text-[10px] text-gray-300">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                                  {isMultiChannel && (
                                    <span className={`text-[9px] px-1 py-0.5 rounded ${
                                      msgChannel === 'phone' ? 'bg-orange-50 text-orange-500' : msgChannel === 'whatsapp' ? 'bg-green-50 text-green-500' : 'bg-blue-50 text-blue-500'
                                    }`}>
                                      {msgChannel}
                                    </span>
                                  )}
                                  {msg.hotel && <span className="text-[9px] text-gray-400">{msg.hotel}</span>}
                                  {msg.duration && <span className="text-[9px] text-gray-400">{Math.round(msg.duration / 60)}m</span>}
                                </div>
                                <div className="flex gap-1">
                                  <button onClick={() => handleFeedback(msg.id, 'correct')} className={`p-1 rounded-full transition-colors ${msg.feedback === 'correct' ? 'bg-green-100 text-green-600' : 'text-gray-300 hover:bg-gray-100'}`} title="Correct"><CheckCircle size={14} /></button>
                                  <button onClick={() => handleFeedback(msg.id, 'needs_improvement')} className={`p-1 rounded-full transition-colors ${msg.feedback === 'needs_improvement' ? 'bg-yellow-100 text-yellow-600' : 'text-gray-300 hover:bg-gray-100'}`} title="Needs Improvement"><AlertTriangle size={14} /></button>
                                  <button onClick={() => handleFeedback(msg.id, 'incorrect')} className={`p-1 rounded-full transition-colors ${msg.feedback === 'incorrect' ? 'bg-red-100 text-red-600' : 'text-gray-300 hover:bg-gray-100'}`} title="Incorrect"><XCircle size={14} /></button>
                                </div>
                              </div>
                            </div>
                          )})}
                        </div>
                      )}
                    </div>
                  );
                })}
                {logs.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    No conversations yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* LEARNING TAB */}
        {activeTab === 'learning' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
            <div className="max-w-3xl mx-auto">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 md:p-6 border-b border-gray-100">
                  <h2 className="text-lg md:text-xl font-serif font-medium text-gray-900 mb-2">Soft Knowledge</h2>
                  <p className="text-xs md:text-sm text-gray-500">
                    Add specific facts or instructions here. The AI will prioritize this information.
                    Useful for temporary updates or correcting specific behaviors.
                  </p>
                </div>

                <div className="p-4 md:p-6 bg-gray-50 border-b border-gray-100">
                  <form onSubmit={handleAddSoftKnowledge} className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={newKnowledgeItem}
                      onChange={(e) => setNewKnowledgeItem(e.target.value)}
                      placeholder="E.g., 'The pool is closed for maintenance until Tuesday.'"
                      className="flex-1 px-3 md:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    />
                    <button
                      type="submit"
                      disabled={!newKnowledgeItem.trim()}
                      className="px-4 md:px-6 py-2 bg-emerald-900 text-white rounded-lg hover:bg-emerald-800 disabled:opacity-50 font-medium text-sm whitespace-nowrap"
                    >
                      Add Rule
                    </button>
                  </form>
                </div>

                <div className="divide-y divide-gray-100">
                  {softKnowledge.map((item, idx) => (
                    <div key={idx} className="p-3 md:p-4 flex justify-between items-start gap-2 hover:bg-gray-50 transition-colors">
                      <div className="flex gap-2 md:gap-3 items-start min-w-0 flex-1">
                        <Brain size={18} className="text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span className="text-xs md:text-sm text-gray-700 break-words">{item}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteSoftKnowledge(idx)}
                        className="text-gray-400 hover:text-red-500 p-2 flex-shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  {softKnowledge.length === 0 && (
                    <div className="p-8 text-center text-gray-400 text-sm">
                      No learned knowledge yet. Add a rule above.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUGGESTIONS TAB */}
        {activeTab === 'suggestions' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-4 md:mb-6">Auto-Learning Suggestions</h2>
              <div className="space-y-4">
                {suggestions.map((suggestion) => (
                  <div key={suggestion.id} className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-200">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${suggestion.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          suggestion.status === 'approved' ? 'bg-green-100 text-green-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                          {suggestion.status.toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-400">{new Date(suggestion.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="mb-4">
                      <h4 className="text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Trigger Question</h4>
                      <p className="text-gray-900 font-medium text-sm md:text-base">{suggestion.trigger_question}</p>
                    </div>
                    <div className="mb-4 md:mb-6">
                      <h4 className="text-xs md:text-sm font-medium text-gray-500 uppercase tracking-wider mb-1">Suggested Answer</h4>
                      <p className="text-gray-700 bg-gray-50 p-2 md:p-3 rounded-lg text-sm">{suggestion.suggested_content}</p>
                    </div>
                    {suggestion.status === 'pending' && (
                      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-end">
                        <button
                          onClick={() => handleSuggestionAction(suggestion.id, 'rejected')}
                          className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm order-2 sm:order-1"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleSuggestionAction(suggestion.id, 'approved')}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 text-sm order-1 sm:order-2"
                        >
                          <CheckCircle size={16} /> Approve & Add to KB
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {suggestions.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    <Lightbulb size={48} className="mx-auto mb-4 text-gray-300" />
                    <p className="text-sm md:text-base">No suggestions yet. The AI will suggest missing info here.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TEAM TAB */}
        {activeTab === 'team' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
            <div className="max-w-4xl mx-auto">
              <div className="flex justify-between items-center mb-4 md:mb-6">
                <h2 className="text-xl md:text-2xl font-bold text-gray-800">Team Management</h2>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6 md:mb-8 p-4 md:p-6">
                <h3 className="text-base md:text-lg font-medium mb-4">Add New Admin</h3>
                <form onSubmit={handleAddUser} className="flex flex-col sm:flex-row gap-3 md:gap-4 sm:items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={e => setNewUserEmail(e.target.value)}
                      className="w-full p-2 border rounded-md text-sm"
                      required
                    />
                  </div>
                  <div className="w-full sm:w-36 md:w-48">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select
                      value={newUserRole}
                      onChange={e => setNewUserRole(e.target.value)}
                      className="w-full p-2 border rounded-md text-sm"
                    >
                      <option value="Viewer">Viewer</option>
                      <option value="Editor">Editor</option>
                      <option value="Manager">Manager</option>
                      <option value="Owner">Owner</option>
                    </select>
                  </div>
                  <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 text-sm whitespace-nowrap">Add User</button>
                </form>
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                      <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                              {user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{user.name || 'Admin'}</div>
                              <div className="text-sm text-gray-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <button onClick={() => handleDeleteUser(user.id)} className="text-gray-400 hover:text-red-600">
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {users.map((user) => (
                  <div key={user.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                          {user.name ? user.name[0].toUpperCase() : user.email[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 text-sm">{user.name || 'Admin'}</div>
                          <div className="text-xs text-gray-500 break-all">{user.email}</div>
                        </div>
                      </div>
                      <button onClick={() => handleDeleteUser(user.id)} className="text-gray-400 hover:text-red-600 p-1">
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {user.role}
                      </span>
                    </div>
                  </div>
                ))}
                {users.length === 0 && (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    No team members yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
            <div className="max-w-2xl mx-auto">
              <h2 className="text-xl md:text-2xl font-serif font-medium text-gray-900 mb-4 md:mb-6">System Configuration</h2>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
                <div className="p-4 md:p-6 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <div>
                    <h3 className="font-medium text-gray-900 text-sm md:text-base">Learning Mode</h3>
                    <p className="text-xs md:text-sm text-gray-500">Allow the AI to use Soft Knowledge to adapt responses.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer self-end sm:self-center">
                    <input
                      type="checkbox"
                      checked={config.learningMode}
                      onChange={(e) => handleConfigChange('learningMode', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                <div className="p-4 md:p-6 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <div>
                    <h3 className="font-medium text-gray-900 text-sm md:text-base">Conversation Logging</h3>
                    <p className="text-xs md:text-sm text-gray-500">Store all chat interactions for review and quality control.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer self-end sm:self-center">
                    <input
                      type="checkbox"
                      checked={config.loggingEnabled}
                      onChange={(e) => handleConfigChange('loggingEnabled', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                <div className="p-4 md:p-6">
                  <h3 className="font-medium text-gray-900 mb-2 text-sm md:text-base">Human Handoff Configuration</h3>
                  <p className="text-xs md:text-sm text-gray-500 mb-4">
                    The system now uses direct client-side links (WhatsApp/Email) for human handoff.
                    Contact numbers are managed in the system configuration files.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab === 'analytics' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50">
            <div className="max-w-4xl mx-auto space-y-6">
              <h2 className="text-xl md:text-2xl font-serif font-medium text-gray-900 flex items-center gap-2">
                <TrendingUp size={24} /> Conversation Analytics
              </h2>

              {!analytics ? (
                <div className="text-center py-12 text-slate-500">Loading analytics...</div>
              ) : (
                <>
                  {/* Conversion Funnel */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Conversion Funnel</h3>
                    <div className="space-y-4">
                      {[
                        { label: 'Sessions', value: analytics.funnel.sessions, color: 'bg-blue-500', pct: 100 },
                        { label: 'Offers Shown', value: analytics.funnel.offers_made, color: 'bg-emerald-500', pct: analytics.funnel.sessions > 0 ? (analytics.funnel.offers_made / analytics.funnel.sessions) * 100 : 0 },
                        { label: 'Offers Clicked', value: analytics.funnel.offers_clicked, color: 'bg-amber-500', pct: analytics.funnel.sessions > 0 ? (analytics.funnel.offers_clicked / analytics.funnel.sessions) * 100 : 0 },
                        { label: 'Emails Sent', value: analytics.funnel.emails_sent || 0, color: 'bg-purple-500', pct: analytics.funnel.sessions > 0 ? ((analytics.funnel.emails_sent || 0) / analytics.funnel.sessions) * 100 : 0 },
                      ].map((step, i) => (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-600">{step.label}</span>
                            <span className="font-semibold text-gray-900">{step.value} <span className="text-xs text-gray-400">({step.pct.toFixed(1)}%)</span></span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2.5">
                            <div className={`${step.color} h-2.5 rounded-full transition-all`} style={{ width: `${Math.max(step.pct, 1)}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Top Questions + Language side by side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                      <h3 className="font-semibold text-gray-900 mb-4">Top Question Categories</h3>
                      <div className="space-y-3">
                        {(analytics.top_questions || []).map((q: any, i: number) => {
                          const maxCount = analytics.top_questions[0]?.count || 1;
                          return (
                            <div key={i}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-600">{q.category}</span>
                                <span className="font-medium text-gray-800">{q.count}</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${(q.count / maxCount) * 100}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                      <h3 className="font-semibold text-gray-900 mb-4">Language Breakdown</h3>
                      <div className="space-y-3">
                        {(analytics.languages || []).map((l: any, i: number) => {
                          const totalLang = analytics.languages.reduce((s: number, x: any) => s + x.count, 0);
                          const pct = totalLang > 0 ? (l.count / totalLang) * 100 : 0;
                          return (
                            <div key={i}>
                              <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-600">{l.language}</span>
                                <span className="font-medium text-gray-800">{pct.toFixed(1)}%</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5">
                                <div className="bg-violet-500 h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Busiest Hours */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">Activity by Hour</h3>
                    <div className="flex items-end justify-between gap-[2px] h-32">
                      {(analytics.busiest_hours || []).map((h: any, i: number) => {
                        const maxH = Math.max(...(analytics.busiest_hours || []).map((x: any) => x.count), 1);
                        const heightPct = (h.count / maxH) * 100;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center">
                            <div
                              className="w-full bg-blue-400 rounded-t hover:bg-blue-500 transition-colors"
                              style={{ height: `${Math.max(heightPct, 2)}%` }}
                              title={`${h.hour}:00 — ${h.count} messages`}
                            ></div>
                            {i % 3 === 0 && <span className="text-[9px] text-gray-400 mt-1">{h.hour}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600">{analytics.avg_messages_per_session?.toFixed(1) || '—'}</div>
                      <div className="text-xs text-gray-500 mt-1">Avg Msgs/Session</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-emerald-600">{analytics.support_rate?.toFixed(1) || '0'}%</div>
                      <div className="text-xs text-gray-500 mt-1">Support Rate</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-amber-600">{analytics.total_logs || 0}</div>
                      <div className="text-xs text-gray-500 mt-1">Total Conversations</div>
                    </div>
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center">
                      <div className="text-2xl font-bold text-purple-600">{analytics.total_events || 0}</div>
                      <div className="text-xs text-gray-500 mt-1">Total Events</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* STATS TAB */}
        {activeTab === 'stats' && !stats && (
          <div className="flex-1 flex items-center justify-center p-4 md:p-6">
            <div className="text-center space-y-4 max-w-md">
              <div className="w-16 h-16 mx-auto bg-slate-100 rounded-full flex items-center justify-center">
                <BarChart2 size={32} className="text-slate-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-700">No Statistics Available</h3>
              <p className="text-sm text-slate-500">
                Statistics will appear here once users start interacting with Sofia AI.
                The stats file may need to be initialized on the server.
              </p>
            </div>
          </div>
        )}
        {activeTab === 'stats' && stats && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-6">
            {/* Key Metrics */}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
              <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-xs md:text-sm font-medium text-slate-500 mb-1">Total Sessions</h3>
                <p className="text-2xl md:text-3xl font-bold text-slate-900">{stats.total_sessions || 0}</p>
              </div>
              <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-xs md:text-sm font-medium text-slate-500 mb-1">Offers Made</h3>
                <p className="text-2xl md:text-3xl font-bold text-slate-900">{stats.total_offers_made}</p>
              </div>
              <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-xs md:text-sm font-medium text-slate-500 mb-1">Offers Clicked</h3>
                <p className="text-2xl md:text-3xl font-bold text-slate-900">{stats.total_offers_clicked}</p>
                <p className="text-[10px] md:text-xs text-emerald-600 mt-1">
                  {stats.total_offers_made > 0
                    ? `${((stats.total_offers_clicked / stats.total_offers_made) * 100).toFixed(1)}% conversion`
                    : '0% conversion'}
                </p>
              </div>
              <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-xs md:text-sm font-medium text-slate-500 mb-1">Forwarded</h3>
                <p className="text-2xl md:text-3xl font-bold text-slate-900">{stats.total_conversations_forwarded}</p>
              </div>
              <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-slate-200 col-span-2 sm:col-span-1">
                <h3 className="text-xs md:text-sm font-medium text-slate-500 mb-1">Assistance</h3>
                <p className="text-2xl md:text-3xl font-bold text-slate-900">{stats.total_assistance_requested}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
              {/* Property Breakdown */}
              <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-100">
                  <h3 className="font-medium text-slate-900 text-sm md:text-base">Property Breakdown</h3>
                </div>
                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-medium">
                      <tr>
                        <th className="px-4 md:px-6 py-3 text-xs">Property</th>
                        <th className="px-4 md:px-6 py-3 text-xs">Sessions</th>
                        <th className="px-4 md:px-6 py-3 text-xs">Offers</th>
                        <th className="px-4 md:px-6 py-3 text-xs">Clicks</th>
                        <th className="px-4 md:px-6 py-3 text-xs">Handoffs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {Object.entries(stats.by_property).map(([prop, data]: [string, any]) => (
                        <tr key={prop} className="hover:bg-slate-50">
                          <td className="px-4 md:px-6 py-3 font-medium text-slate-900 text-xs md:text-sm">{prop}</td>
                          <td className="px-4 md:px-6 py-3 text-xs md:text-sm">{data.sessions || 0}</td>
                          <td className="px-4 md:px-6 py-3 text-xs md:text-sm">{data.offers_made}</td>
                          <td className="px-4 md:px-6 py-3 text-xs md:text-sm">{data.offers_clicked}</td>
                          <td className="px-4 md:px-6 py-3 text-xs md:text-sm">{data.forwarded + data.assistance}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Mobile Cards */}
                <div className="sm:hidden divide-y divide-slate-100">
                  {Object.entries(stats.by_property).map(([prop, data]: [string, any]) => (
                    <div key={prop} className="p-4">
                      <h4 className="font-medium text-slate-900 text-sm mb-2">{prop}</h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between bg-slate-50 p-2 rounded">
                          <span className="text-slate-500">Sessions</span>
                          <span className="font-medium">{data.sessions || 0}</span>
                        </div>
                        <div className="flex justify-between bg-slate-50 p-2 rounded">
                          <span className="text-slate-500">Offers</span>
                          <span className="font-medium">{data.offers_made}</span>
                        </div>
                        <div className="flex justify-between bg-slate-50 p-2 rounded">
                          <span className="text-slate-500">Clicks</span>
                          <span className="font-medium">{data.offers_clicked}</span>
                        </div>
                        <div className="flex justify-between bg-slate-50 p-2 rounded">
                          <span className="text-slate-500">Handoffs</span>
                          <span className="font-medium">{data.forwarded + data.assistance}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Channel Breakdown */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-100">
                  <h3 className="font-medium text-slate-900 text-sm md:text-base">Channel Breakdown</h3>
                </div>
                <div className="p-4 md:p-6">
                  {stats.by_channel && Object.entries(stats.by_channel).length > 0 ? (
                    <div className="space-y-3 md:space-y-4">
                      {Object.entries(stats.by_channel).map(([channel, count]: [string, any]) => (
                        <div key={channel} className="flex items-center justify-between gap-2">
                          <span className="capitalize text-slate-700 text-xs md:text-sm">{channel}</span>
                          <div className="flex items-center gap-2 md:gap-3">
                            <div className="w-20 md:w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${(count / (stats.total_sessions || 1)) * 100}%` }}
                              ></div>
                            </div>
                            <span className="font-bold text-slate-900 text-xs md:text-sm">{count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 text-center py-4 text-sm">No channel data yet</p>
                  )}
                </div>
              </div>
            </div>

            {/* GDPR Note */}
            <div className="bg-slate-50 p-3 md:p-4 rounded-lg border border-slate-200 text-[10px] md:text-xs text-slate-500 flex items-start gap-2">
              <Lock size={14} className="mt-0.5 flex-shrink-0" />
              <p>
                <strong>GDPR Compliance:</strong> All statistics are aggregated and anonymized.
                Session IDs are pseudonymous and reset per session. No PII (names, emails, IPs) is stored in the statistics database.
                Data is retained for analytical purposes only.
              </p>
            </div>
          </div>
        )}

        {/* PHONE TAB - Live Monitoring Dashboard */}
        {activeTab === 'phone' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-6">
            {/* Header with Refresh */}
            <div className="flex justify-between items-center">
              <h2 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Phone size={24} /> Phone Service Monitor
              </h2>
              <button
                onClick={loadPhoneStatus}
                disabled={phoneStatusLoading}
                className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 flex items-center gap-2 text-sm disabled:opacity-50"
              >
                <RotateCcw size={16} className={phoneStatusLoading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {!phoneStatus ? (
              <div className="flex-1 flex items-center justify-center p-4 md:p-6">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 mx-auto bg-slate-100 rounded-full flex items-center justify-center">
                    <Phone size={32} className="text-slate-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700">Loading Phone Status...</h3>
                </div>
              </div>
            ) : (
              <>
                {/* Service Health Status */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                  <div className={`p-4 rounded-xl shadow-sm border ${phoneStatus.health?.server === 'online' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {phoneStatus.health?.server === 'online' ? (
                        <CheckCircle size={18} className="text-green-600" />
                      ) : (
                        <XCircle size={18} className="text-red-600" />
                      )}
                      <span className="text-sm font-medium text-slate-700">Server</span>
                    </div>
                    <p className={`text-lg font-bold ${phoneStatus.health?.server === 'online' ? 'text-green-700' : 'text-red-700'}`}>
                      {phoneStatus.health?.server === 'online' ? 'Online' : 'Offline'}
                    </p>
                  </div>
                  <div className={`p-4 rounded-xl shadow-sm border ${phoneStatus.health?.phoneIndex === 'healthy' ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      {phoneStatus.health?.phoneIndex === 'healthy' ? (
                        <CheckCircle size={18} className="text-green-600" />
                      ) : (
                        <AlertTriangle size={18} className="text-yellow-600" />
                      )}
                      <span className="text-sm font-medium text-slate-700">Phone Index</span>
                    </div>
                    <p className={`text-lg font-bold ${phoneStatus.health?.phoneIndex === 'healthy' ? 'text-green-700' : 'text-yellow-700'}`}>
                      {phoneStatus.stats?.phone_index_entries?.toLocaleString() || 0} entries
                    </p>
                    <p className="text-xs text-slate-500">{phoneStatus.health?.phoneIndexAge !== null ? `${phoneStatus.health.phoneIndexAge}min old` : 'Unknown age'}</p>
                  </div>
                  <div className={`p-4 rounded-xl shadow-sm border ${phoneStatus.stats?.active_calls > 0 ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Activity size={18} className={phoneStatus.stats?.active_calls > 0 ? 'text-blue-600' : 'text-slate-400'} />
                      <span className="text-sm font-medium text-slate-700">Active Calls</span>
                    </div>
                    <p className={`text-2xl font-bold ${phoneStatus.stats?.active_calls > 0 ? 'text-blue-700' : 'text-slate-600'}`}>
                      {phoneStatus.stats?.active_calls || 0}
                    </p>
                  </div>
                  <div className={`p-4 rounded-xl shadow-sm border ${phoneStatus.health?.recentActivity === 'active' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp size={18} className={phoneStatus.health?.recentActivity === 'active' ? 'text-emerald-600' : 'text-slate-400'} />
                      <span className="text-sm font-medium text-slate-700">Recent Activity</span>
                    </div>
                    <p className={`text-lg font-bold ${phoneStatus.health?.recentActivity === 'active' ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {phoneStatus.health?.recentActivity === 'active' ? 'Active' : 'Idle'}
                    </p>
                  </div>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                    <p className="text-2xl font-bold text-slate-900">{phoneStatus.stats?.calls_last_hour || 0}</p>
                    <p className="text-xs text-slate-500">Last Hour</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                    <p className="text-2xl font-bold text-slate-900">{phoneStatus.stats?.calls_last_24h || 0}</p>
                    <p className="text-xs text-slate-500">Last 24h</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                    <p className="text-2xl font-bold text-slate-900">{phoneStatus.stats?.calls_last_week || 0}</p>
                    <p className="text-xs text-slate-500">Last 7 Days</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                    <p className="text-2xl font-bold text-emerald-600">{phoneStatus.stats?.identified_callers_24h || 0}</p>
                    <p className="text-xs text-slate-500">Identified (24h)</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                    <p className="text-2xl font-bold text-amber-600">{phoneStatus.stats?.unidentified_callers_24h || 0}</p>
                    <p className="text-xs text-slate-500">Unidentified (24h)</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                    <p className="text-2xl font-bold text-blue-600">{Math.floor((phoneStatus.stats?.avg_duration_seconds || 0) / 60)}:{String((phoneStatus.stats?.avg_duration_seconds || 0) % 60).padStart(2, '0')}</p>
                    <p className="text-xs text-slate-500">Avg Duration</p>
                  </div>
                </div>

                {/* Active Calls - Real Time */}
                {phoneStatus.active_calls?.length > 0 && (
                  <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-200 p-4">
                    <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                      <Activity size={18} className="animate-pulse" /> Live Calls
                    </h3>
                    <div className="space-y-2">
                      {phoneStatus.active_calls.map((call: any) => (
                        <div key={call.call_id} className="bg-white p-3 rounded-lg flex justify-between items-center">
                          <div>
                            <span className="font-mono text-sm">{call.caller}</span>
                            <span className="text-xs text-slate-500 ml-2">Started {new Date(call.started_at).toLocaleTimeString()}</span>
                          </div>
                          <div className="text-blue-700 font-bold">
                            {Math.floor(call.duration_seconds / 60)}:{String(call.duration_seconds % 60).padStart(2, '0')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Anomalies / Issues */}
                {(phoneStatus.anomalies?.length > 0 || phoneStatus.suspicious_calls?.length > 0) && (
                  <div className="bg-red-50 rounded-xl shadow-sm border border-red-200 p-4">
                    <h3 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
                      <AlertTriangle size={18} /> Issues Detected
                    </h3>
                    {phoneStatus.anomalies?.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs text-red-700 font-medium mb-2">Anomalies (24h)</p>
                        {phoneStatus.anomalies.map((a: any, i: number) => (
                          <div key={i} className="bg-white p-2 rounded mb-1 text-xs">
                            <span className="font-medium text-red-800">{a.type}:</span> {a.details}
                          </div>
                        ))}
                      </div>
                    )}
                    {phoneStatus.suspicious_calls?.length > 0 && (
                      <div>
                        <p className="text-xs text-red-700 font-medium mb-2">Suspicious Calls (7 days): {phoneStatus.stats?.suspicious_calls_week || 0}</p>
                        {phoneStatus.suspicious_calls.slice(0, 5).map((c: any, i: number) => (
                          <div key={i} className="bg-white p-2 rounded mb-1 text-xs flex justify-between">
                            <span className="font-mono">{c.caller || 'Unknown'}</span>
                            <span className="text-red-600">{c.reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Calls by Hotel */}
                {phoneStatus.calls_by_hotel && Object.keys(phoneStatus.calls_by_hotel).length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-900 mb-3">Calls by Hotel (7 days)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {Object.entries(phoneStatus.calls_by_hotel).map(([hotel, count]: [string, any]) => (
                        <div key={hotel} className="bg-slate-50 p-3 rounded-lg flex justify-between items-center">
                          <span className="text-sm text-slate-700 truncate">{hotel}</span>
                          <span className="font-bold text-slate-900">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Calls Table */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="px-4 md:px-6 py-3 md:py-4 border-b border-slate-100">
                    <h3 className="font-medium text-slate-900 text-sm md:text-base">Recent Calls (Last 24h)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 font-medium">
                        <tr>
                          <th className="px-4 py-3 text-xs">Time</th>
                          <th className="px-4 py-3 text-xs">Caller</th>
                          <th className="px-4 py-3 text-xs">Guest</th>
                          <th className="px-4 py-3 text-xs">Hotel</th>
                          <th className="px-4 py-3 text-xs">Duration</th>
                          <th className="px-4 py-3 text-xs">Turns</th>
                          <th className="px-4 py-3 text-xs">Tools</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(phoneStatus.recent_calls || []).map((call: any) => (
                          <tr key={call.call_id} className="hover:bg-slate-50">
                            <td className="px-4 py-3 text-xs whitespace-nowrap">
                              {new Date(call.started_at).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-4 py-3 text-xs font-mono">{call.caller}</td>
                            <td className="px-4 py-3 text-xs">
                              {call.guest_name !== 'Unknown' ? (
                                <span className="text-emerald-700 font-medium">{call.guest_name}</span>
                              ) : (
                                <span className="text-slate-400">Unknown</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs">{call.hotel}</td>
                            <td className="px-4 py-3 text-xs">
                              {call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}:${String(call.duration_seconds % 60).padStart(2, '0')}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-xs">{call.transcript_turns || 0}</td>
                            <td className="px-4 py-3 text-xs">
                              {call.tools_used?.length > 0 ? (
                                <span className="text-blue-600">{call.tools_used.join(', ')}</span>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {(!phoneStatus.recent_calls || phoneStatus.recent_calls.length === 0) && (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-slate-400">No calls in the last 24 hours</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Started but not completed */}
                {phoneStatus.started_not_completed?.length > 0 && (
                  <div className="bg-yellow-50 rounded-xl shadow-sm border border-yellow-200 p-4">
                    <h3 className="font-semibold text-yellow-900 mb-3 flex items-center gap-2">
                      <AlertTriangle size={18} /> Incomplete Calls
                    </h3>
                    <p className="text-xs text-yellow-700 mb-2">These calls started but never received a completion event:</p>
                    {phoneStatus.started_not_completed.map((c: any, i: number) => (
                      <div key={i} className="bg-white p-2 rounded mb-1 text-xs flex justify-between">
                        <span className="font-mono">{c.caller}</span>
                        <span className="text-yellow-600">{new Date(c.started_at).toLocaleString('it-IT')}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* PM2 Check Note */}
                <div className="bg-slate-50 p-3 md:p-4 rounded-lg border border-slate-200 text-[10px] md:text-xs text-slate-500">
                  <p>
                    <strong>SIP Services:</strong> To check sip-register and sip-proxy status, SSH into the server and run:
                    <code className="bg-slate-200 px-1 rounded mx-1">pm2 status</code>
                    <code className="bg-slate-200 px-1 rounded mx-1">pm2 logs sip-register</code>
                    <code className="bg-slate-200 px-1 rounded mx-1">pm2 logs sip-proxy</code>
                  </p>
                </div>
              </>
            )}
          </div>
        )}
        {/* HEALTH TAB */}
        {activeTab === 'health' && (
          <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
            {healthLoading && !healthData && (
              <div className="text-center py-12 text-slate-400">Loading health data...</div>
            )}
            {!healthLoading && !healthData && (
              <div className="text-center py-12 text-slate-400">Could not load health data. Try refreshing.</div>
            )}
            {healthData && (
              <>
                {/* Alerts */}
                {healthData.alerts?.length > 0 && (
                  <div className="space-y-2">
                    {healthData.alerts.map((alert: any, i: number) => (
                      <div key={i} className={`p-3 rounded-lg border ${alert.type === 'critical' ? 'bg-red-50 border-red-300 text-red-800' : 'bg-yellow-50 border-yellow-300 text-yellow-800'}`}>
                        <AlertTriangle size={16} className="inline mr-2" />
                        {alert.message}
                      </div>
                    ))}
                  </div>
                )}
                {healthData.alerts?.length === 0 && (
                  <div className="p-3 rounded-lg border bg-green-50 border-green-300 text-green-800">
                    <CheckCircle size={16} className="inline mr-2" />
                    All systems healthy
                  </div>
                )}

                {/* System Info */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900 mb-3">System</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-slate-900">{healthData.system.uptime_human}</p>
                      <p className="text-xs text-slate-500">Uptime</p>
                    </div>
                    <div className="text-center">
                      <p className={`text-2xl font-bold ${healthData.system.memory_mb > 400 ? 'text-red-600' : 'text-slate-900'}`}>{healthData.system.memory_mb}MB</p>
                      <p className="text-xs text-slate-500">Memory (RSS)</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-slate-900">{healthData.system.node_version}</p>
                      <p className="text-xs text-slate-500">Node Version</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-mono text-slate-700">{new Date(healthData.system.started_at).toLocaleString('it-IT')}</p>
                      <p className="text-xs text-slate-500">Started At</p>
                    </div>
                  </div>
                </div>

                {/* Services */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900 mb-3">Services</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className={`p-3 rounded-lg border ${healthData.services.gemini.status === 'ok' ? 'bg-green-50 border-green-200' : healthData.services.gemini.status === 'stale' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                      <p className="text-xs text-slate-500 mb-1">Gemini AI</p>
                      <p className={`font-bold ${healthData.services.gemini.status === 'ok' ? 'text-green-700' : healthData.services.gemini.status === 'stale' ? 'text-red-700' : 'text-slate-500'}`}>
                        {healthData.services.gemini.status === 'ok' ? 'OK' : healthData.services.gemini.status === 'stale' ? 'Stale' : 'Unknown'}
                      </p>
                      {healthData.services.gemini.last_success_minutes_ago !== null && (
                        <p className="text-xs text-slate-400">{healthData.services.gemini.last_success_minutes_ago}m ago</p>
                      )}
                    </div>
                    <div className={`p-3 rounded-lg border ${healthData.services.hic_auth.status === 'ok' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <p className="text-xs text-slate-500 mb-1">HotelInCloud</p>
                      <p className={`font-bold ${healthData.services.hic_auth.status === 'ok' ? 'text-green-700' : 'text-red-700'}`}>
                        {healthData.services.hic_auth.status === 'ok' ? 'OK' : 'Expired'}
                      </p>
                      {healthData.services.hic_auth.status === 'ok' && (
                        <p className="text-xs text-slate-400">{healthData.services.hic_auth.expires_in_hours}h left</p>
                      )}
                    </div>
                    <div className={`p-3 rounded-lg border ${healthData.services.whatsapp.status === 'ok' ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                      <p className="text-xs text-slate-500 mb-1">WhatsApp</p>
                      <p className={`font-bold ${healthData.services.whatsapp.status === 'ok' ? 'text-green-700' : 'text-yellow-700'}`}>
                        {healthData.services.whatsapp.status === 'ok' ? 'OK' : 'Not Configured'}
                      </p>
                      <p className="text-xs text-slate-400">{healthData.services.whatsapp.active_sessions} sessions</p>
                    </div>
                    <div className={`p-3 rounded-lg border ${healthData.services.phone_index.status === 'ok' ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                      <p className="text-xs text-slate-500 mb-1">Phone Index</p>
                      <p className={`font-bold ${healthData.services.phone_index.status === 'ok' ? 'text-green-700' : 'text-yellow-700'}`}>
                        {healthData.services.phone_index.entries} entries
                      </p>
                      {healthData.services.phone_index.age_minutes !== null && (
                        <p className="text-xs text-slate-400">{healthData.services.phone_index.age_minutes}m old</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Counters */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-900 mb-3">Total Requests</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(healthData.counters.total_requests).map(([key, val]: [string, any]) => (
                        <div key={key} className="bg-slate-50 p-3 rounded-lg text-center">
                          <p className="text-xl font-bold text-slate-900">{val}</p>
                          <p className="text-xs text-slate-500 capitalize">{key}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-900 mb-3">Errors</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(healthData.counters.errors).map(([key, val]: [string, any]) => (
                        <div key={key} className={`p-3 rounded-lg text-center ${val > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                          <p className={`text-xl font-bold ${val > 0 ? 'text-red-600' : 'text-slate-900'}`}>{val}</p>
                          <p className="text-xs text-slate-500 capitalize">{key}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Last Success */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900 mb-3">Last Successful Operation</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(healthData.counters.last_success).map(([key, val]: [string, any]) => (
                      <div key={key} className="bg-slate-50 p-3 rounded-lg text-center">
                        <p className="text-sm font-medium text-slate-700">{val}</p>
                        <p className="text-xs text-slate-500 capitalize">{key}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* SECURITY METRICS */}
            {securityData && (
              <>
                <div className="border-t border-slate-200 pt-6">
                  <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Lock size={20} /> Security & Bot Detection
                  </h2>
                </div>

                {/* Summary Banner */}
                <div className={`p-4 rounded-xl border ${securityData.summary.total_events_24h > 0 ? 'bg-amber-50 border-amber-300' : 'bg-green-50 border-green-300'}`}>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className={`text-3xl font-bold ${securityData.summary.total_events_24h > 50 ? 'text-red-600' : securityData.summary.total_events_24h > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {securityData.summary.total_events_24h}
                      </p>
                      <p className="text-xs text-slate-600">Events (24h)</p>
                    </div>
                    <div>
                      <p className="text-3xl font-bold text-slate-900">{securityData.summary.total_events_7d}</p>
                      <p className="text-xs text-slate-600">Events (7d)</p>
                    </div>
                    <div>
                      <p className={`text-3xl font-bold ${securityData.summary.unique_attacker_ips_24h > 5 ? 'text-red-600' : 'text-slate-900'}`}>
                        {securityData.summary.unique_attacker_ips_24h}
                      </p>
                      <p className="text-xs text-slate-600">Unique IPs (24h)</p>
                    </div>
                  </div>
                </div>

                {/* Category Breakdown */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900 mb-3">Threat Categories</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs">Category</th>
                          <th className="px-3 py-2 text-right text-xs">1h</th>
                          <th className="px-3 py-2 text-right text-xs">24h</th>
                          <th className="px-3 py-2 text-right text-xs">7d</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[
                          { label: 'Failed Logins', key: 'failed_logins', icon: '🔐' },
                          { label: 'Rate Limit Hits', key: 'rate_limit_hits', icon: '🚫' },
                          { label: 'CSRF Failures', key: 'csrf_failures', icon: '🛡' },
                          { label: 'WS Auth Rejects', key: 'ws_auth_rejects', icon: '🔌' },
                          { label: 'Invalid API Keys', key: 'invalid_api_keys', icon: '🔑' },
                          { label: 'WA Signature Failures', key: 'wa_signature_failures', icon: '💬' },
                          { label: 'WA Rate Limits', key: 'wa_rate_limits', icon: '⏱' },
                          { label: 'Unknown WS Paths', key: 'unknown_ws_paths', icon: '❓' },
                        ].map(({ label, key, icon }) => {
                          const cat = securityData.categories[key];
                          if (!cat) return null;
                          const hasActivity = cat.last_7d > 0;
                          return (
                            <tr key={key} className={hasActivity ? 'bg-amber-50/50' : ''}>
                              <td className="px-3 py-2 text-xs font-medium">{icon} {label}</td>
                              <td className={`px-3 py-2 text-right text-xs font-mono ${cat.last_hour > 0 ? 'text-red-600 font-bold' : 'text-slate-400'}`}>{cat.last_hour}</td>
                              <td className={`px-3 py-2 text-right text-xs font-mono ${cat.last_24h > 10 ? 'text-red-600 font-bold' : cat.last_24h > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{cat.last_24h}</td>
                              <td className={`px-3 py-2 text-right text-xs font-mono ${cat.last_7d > 0 ? 'text-slate-700' : 'text-slate-400'}`}>{cat.last_7d}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Top Offending IPs */}
                {securityData.top_offenders_24h?.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-red-200 p-4">
                    <h3 className="font-semibold text-red-900 mb-3">Top Offending IPs (24h)</h3>
                    <div className="space-y-2">
                      {securityData.top_offenders_24h.map((o: any, i: number) => (
                        <div key={i} className="flex justify-between items-center bg-red-50 p-2 rounded-lg">
                          <span className="font-mono text-sm text-slate-700">{o.ip}</span>
                          <span className="text-red-700 font-bold text-sm">{o.count} events</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Failed Logins */}
                {securityData.recent_failed_logins?.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-900 mb-3">Recent Failed Logins</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs">Time</th>
                            <th className="px-3 py-2 text-left text-xs">IP</th>
                            <th className="px-3 py-2 text-left text-xs">Email Attempted</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {securityData.recent_failed_logins.map((e: any, i: number) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(e.time).toLocaleString('it-IT')}</td>
                              <td className="px-3 py-2 text-xs font-mono">{e.ip}</td>
                              <td className="px-3 py-2 text-xs">{e.email}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Recent Rate Limit Hits */}
                {securityData.recent_rate_limits?.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                    <h3 className="font-semibold text-slate-900 mb-3">Recent Rate Limit Blocks</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs">Time</th>
                            <th className="px-3 py-2 text-left text-xs">IP</th>
                            <th className="px-3 py-2 text-left text-xs">Path</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {securityData.recent_rate_limits.map((e: any, i: number) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(e.time).toLocaleString('it-IT')}</td>
                              <td className="px-3 py-2 text-xs font-mono">{e.ip}</td>
                              <td className="px-3 py-2 text-xs font-mono">{e.path}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default AdminPanel;
