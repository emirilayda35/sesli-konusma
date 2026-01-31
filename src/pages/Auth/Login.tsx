import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FaEye, FaEyeSlash, FaDownload } from 'react-icons/fa';
import { signInWithEmailAndPassword, getAuth } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { useAuth } from '../../contexts/AuthContext';
import { auth, firebaseConfig } from '../../firebase';
import DownloadModal from '../../components/DownloadModal';
import '../../styles/auth.css';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const { switchAccount } = useAuth();
    const navigate = useNavigate();

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        try {
            setError('');
            setLoading(true);

            // 1. Initial login on helper app to get UID
            const helperAppName = 'auth-helper';
            const helperApp = getApps().find(a => a.name === helperAppName) || initializeApp(firebaseConfig, helperAppName);
            const helperAuth = getAuth(helperApp);

            const userCredential = await signInWithEmailAndPassword(helperAuth, email, password);
            const uid = userCredential.user.uid;

            // 2. Persistent login on named app
            const name = `app-${uid}`;
            const permanentApp = getApps().find(a => a.name === name) || initializeApp(firebaseConfig, name);
            const permanentAuth = getAuth(permanentApp);
            await signInWithEmailAndPassword(permanentAuth, email, password);

            // 3. Switch account in context
            await switchAccount(uid);

            navigate('/');
        } catch (err: any) {
            setError('Giriş yapılamadı. Lütfen bilgilerinizi kontrol edin.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="auth-page">
            <button
                onClick={() => setIsDownloadModalOpen(true)}
                style={{
                    position: 'absolute',
                    top: '20px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(0, 0, 0, 0.4)',
                    color: 'white',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    padding: '10px 20px',
                    borderRadius: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    zIndex: 10,
                    transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(0, 0, 0, 0.4)'}
            >
                <FaDownload size={14} /> Uygulamayı İndir
            </button>

            <DownloadModal isOpen={isDownloadModalOpen} onClose={() => setIsDownloadModalOpen(false)} />

            <div className="auth-card">
                <h2>Tekrar hoş geldin!</h2>
                <p>Seni yeniden görmek çok güzel!</p>

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
                        {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
                    </button>
                </form>

                <div className="auth-footer">
                    Bir hesaba mı ihtiyacın var? <Link to="/register">Kaydol</Link>
                </div>
            </div>
        </div>
    );
}
