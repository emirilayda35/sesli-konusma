import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { createUserWithEmailAndPassword, updateProfile, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { useAuth } from '../../contexts/AuthContext';
import { auth, firebaseConfig } from '../../firebase';
import '../../styles/auth.css';

export default function Register() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [username, setUsername] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { switchAccount } = useAuth();
    const navigate = useNavigate();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (password.length < 6) {
            return setError('Şifre en az 6 karakter olmalıdır.');
        }

        try {
            setError('');
            setLoading(true);

            // 1. Initial register on helper app to get UID
            const helperAppName = 'auth-helper';
            const helperApp = getApps().find(a => a.name === helperAppName) || initializeApp(firebaseConfig, helperAppName);
            const helperAuth = getAuth(helperApp);

            const userCredential = await createUserWithEmailAndPassword(helperAuth, email, password);
            const user = userCredential.user;
            await updateProfile(user, {
                displayName: username
            });
            const uid = user.uid;

            // 2. Persistent login on named app
            const name = `app-${uid}`;
            const permanentApp = getApps().find(a => a.name === name) || initializeApp(firebaseConfig, name);
            const permanentAuth = getAuth(permanentApp);
            await signInWithEmailAndPassword(permanentAuth, email, password);

            // 3. Switch account in context
            await switchAccount(uid);

            navigate('/');
        } catch (err: any) {
            if (err.code === 'auth/email-already-in-use') {
                setError('Bu e-posta adresi zaten kullanımda.');
            } else {
                setError('Hesap oluşturulurken bir hata oluştu.');
            }
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-page">
            <div className="auth-card">
                <h2>Hesap oluştur</h2>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label>E-POSTA</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>KULLANICI ADI</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>ŞİFRE</label>
                        <div className="password-input-wrapper">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                style={{ width: '100%', paddingRight: '40px' }}
                            />
                            <div
                                className="password-toggle-icon"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? <FaEyeSlash /> : <FaEye />}
                            </div>
                        </div>
                    </div>
                    <button disabled={loading} className="auth-button" type="submit">
                        {loading ? 'Hesap oluşturuluyor...' : 'Devam Et'}
                    </button>
                </form>

                <div className="auth-footer">
                    Zaten bir hesabın var mı? <Link to="/login">Giriş yap</Link>
                </div>
            </div>
        </div>
    );
}
