import React, { useState } from 'react';
import { FaTimes, FaEye, FaEyeSlash } from 'react-icons/fa';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp, getApp, getApps } from 'firebase/app';
import { firebaseConfig } from '../firebase';

interface AddAccountModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (user: any) => void;
}

export default function AddAccountModal({ isOpen, onClose, onSuccess }: AddAccountModalProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // 1. Initial login on a static helper app to get the UID
            const helperAppName = 'auth-helper';
            const helperApp = getApps().find(a => a.name === helperAppName) || initializeApp(firebaseConfig, helperAppName);
            const helperAuth = getAuth(helperApp);

            const userCredential = await signInWithEmailAndPassword(helperAuth, email, password);
            const user = userCredential.user;
            const uid = user.uid;

            // 2. Silent login on the permanent named app for this specific UID
            // This ensures the token is persisted in IndexedDB under the 'app-${uid}' key
            const name = `app-${uid}`;
            const permanentApp = getApps().find(a => a.name === name) || initializeApp(firebaseConfig, name);
            const permanentAuth = getAuth(permanentApp);

            // Re-authenticate silently on the permanent app
            await signInWithEmailAndPassword(permanentAuth, email, password);

            onSuccess(user);
            onClose();
        } catch (err: any) {
            console.error(err);
            setError(err.message === 'Firebase: Error (auth/invalid-credential).'
                ? 'Hatalı e-posta veya şifre.'
                : 'Bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="settings-overlay" style={{ zIndex: 2000 }}>
            <div className="settings-content-wrapper" style={{ maxWidth: '400px', height: 'auto', borderRadius: '8px', margin: 'auto', padding: '30px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0 }}>Hesap Ekle</h2>
                    <FaTimes onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} />
                </div>

                <form onSubmit={handleLogin}>
                    <div className="settings-field">
                        <label className="settings-label">E-POSTA</label>
                        <input
                            className="settings-input"
                            type="email"
                            required
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>
                    <div className="settings-field" style={{ marginTop: '15px' }}>
                        <label className="settings-label">ŞİFRE</label>
                        <div className="password-input-wrapper">
                            <input
                                className="settings-input"
                                type={showPassword ? "text" : "password"}
                                required
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                style={{ paddingRight: '40px' }}
                            />
                            <div
                                className="password-toggle-icon"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <FaEyeSlash /> : <FaEye />}
                            </div>
                        </div>
                    </div>

                    {error && <div style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '10px' }}>{error}</div>}

                    <div style={{ marginTop: '30px', display: 'flex', gap: '10px' }}>
                        <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>İptal</button>
                        <button type="submit" className="btn-primary" style={{ flex: 1 }} disabled={loading}>
                            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
