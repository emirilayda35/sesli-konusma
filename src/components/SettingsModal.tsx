import React, { useState, useEffect } from 'react';
import { FaTimes } from 'react-icons/fa';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import '../styles/settings.css';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const { currentUser, userData } = useAuth();
    const [activeTab, setActiveTab] = useState('voice');
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [settings, setSettings] = useState({
        inputId: localStorage.getItem('voice_inputId') || 'default',
        outputId: localStorage.getItem('voice_outputId') || 'default',
        inputVolume: parseInt(localStorage.getItem('voice_inputVolume') || '100'),
        outputVolume: parseInt(localStorage.getItem('voice_outputVolume') || '100'),
        sensitivity: parseInt(localStorage.getItem('voice_sensitivity') || '10'),
        echoCancellation: localStorage.getItem('voice_echoCancellation') !== 'false',
        noiseSuppression: localStorage.getItem('voice_noiseSuppression') !== 'false',
        theme: localStorage.getItem('settings_theme') || 'dark',
    });

    useEffect(() => {
        const getDevices = async () => {
            try {
                // Request permission first to get device labels
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const allDevices = await navigator.mediaDevices.enumerateDevices();
                setDevices(allDevices.filter(d => d.kind === 'audioinput' || d.kind === 'audiooutput'));
                stream.getTracks().forEach(t => t.stop());
            } catch (err) {
                console.error("Error fetching devices:", err);
            }
        };
        if (isOpen && activeTab === 'voice') getDevices();
    }, [isOpen, activeTab]);

    const updateSetting = (key: string, value: any) => {
        setSettings(prev => {
            const next = { ...prev, [key]: value };
            const storageKey = key === 'theme' ? 'settings_theme' : `voice_${key}`;
            localStorage.setItem(storageKey, value.toString());

            if (key === 'theme') {
                document.documentElement.setAttribute('data-theme', value);
            }

            return next;
        });
        // Dispatch event for components to pick up
        window.dispatchEvent(new CustomEvent('voice_settings_updated', { detail: { key, value } }));
    };

    if (!isOpen) return null;

    const renderContent = () => {
        switch (activeTab) {
            case 'account':
                return (
                    <>
                        <div className="settings-header">
                            <h2>Hesabım</h2>
                        </div>
                        <div className="settings-section">
                            <div className="settings-field">
                                <label className="settings-label">Kullanıcı Adı</label>
                                <input className="settings-input" value={userData?.displayName || ''} disabled />
                            </div>
                            <div className="settings-field">
                                <label className="settings-label">E-posta</label>
                                <input className="settings-input" value={currentUser?.email || ''} disabled />
                            </div>
                            <div className="settings-field">
                                <label className="settings-label">UID</label>
                                <input className="settings-input" value={currentUser?.uid || ''} disabled style={{ fontSize: 10 }} />
                            </div>
                            <button
                                className="settings-input"
                                style={{ background: 'var(--danger)', color: 'white', cursor: 'pointer', fontWeight: 'bold', height: '40px', marginTop: '20px' }}
                                onClick={() => auth.signOut()}
                            >
                                Çıkış Yap
                            </button>
                        </div>
                    </>
                );
            case 'appearance':
                return (
                    <>
                        <div className="settings-header">
                            <h2>Görünüm</h2>
                        </div>
                        <div className="settings-section">
                            <h4>TEMA</h4>
                            <div className="settings-field">
                                <label className="settings-label">Renk Teması</label>
                                <select
                                    className="settings-select"
                                    value={settings.theme}
                                    onChange={(e) => updateSetting('theme', e.target.value)}
                                >
                                    <option value="dark">Koyu</option>
                                    <option value="light">Açık</option>
                                </select>
                            </div>
                        </div>
                    </>
                );
            case 'voice':
            default:
                return (
                    <>
                        <div className="settings-header">
                            <h2>Ses ve Görüntü</h2>
                        </div>

                        <div className="settings-section">
                            <h4>SES AYARLARI</h4>

                            <div className="settings-field">
                                <label className="settings-label">Giriş Cihazı</label>
                                <select
                                    className="settings-select"
                                    value={settings.inputId}
                                    onChange={(e) => updateSetting('inputId', e.target.value)}
                                >
                                    {devices.filter(d => d.kind === 'audioinput').map(d => (
                                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Mikrofon ${d.deviceId.slice(0, 5)}`}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="settings-field">
                                <label className="settings-label">Giriş Ses Seviyesi</label>
                                <div className="settings-slider-wrapper">
                                    <input
                                        type="range"
                                        className="settings-slider"
                                        value={settings.inputVolume}
                                        onChange={(e) => updateSetting('inputVolume', e.target.value)}
                                    />
                                    <span>%{settings.inputVolume}</span>
                                </div>
                            </div>

                            <div className="settings-field">
                                <label className="settings-label">Çıkış Cihazı</label>
                                <select
                                    className="settings-select"
                                    value={settings.outputId}
                                    onChange={(e) => updateSetting('outputId', e.target.value)}
                                >
                                    {devices.filter(d => d.kind === 'audiooutput').map(d => (
                                        <option key={d.deviceId} value={d.deviceId}>{d.label || `Hoparlör ${d.deviceId.slice(0, 5)}`}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="settings-field">
                                <label className="settings-label">Çıkış Ses Seviyesi</label>
                                <div className="settings-slider-wrapper">
                                    <input
                                        type="range"
                                        className="settings-slider"
                                        value={settings.outputVolume}
                                        onChange={(e) => updateSetting('outputVolume', e.target.value)}
                                    />
                                    <span>%{settings.outputVolume}</span>
                                </div>
                            </div>
                        </div>

                        <div className="settings-section">
                            <h4>GELİŞMİŞ</h4>

                            <div className="settings-toggle-wrapper">
                                <div>
                                    <div style={{ color: 'var(--text-header)' }}>Yankı Engelleme</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sesin geri dönmesini engeller.</div>
                                </div>
                                <div
                                    className={`settings-toggle ${settings.echoCancellation ? 'on' : ''}`}
                                    onClick={() => updateSetting('echoCancellation', !settings.echoCancellation)}
                                />
                            </div>

                            <div className="settings-toggle-wrapper">
                                <div>
                                    <div style={{ color: 'var(--text-header)' }}>Gürültü Azaltma</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Arka plan gürültülerini filtreler.</div>
                                </div>
                                <div
                                    className={`settings-toggle ${settings.noiseSuppression ? 'on' : ''}`}
                                    onClick={() => updateSetting('noiseSuppression', !settings.noiseSuppression)}
                                />
                            </div>

                            <div className="settings-field" style={{ marginTop: 20 }}>
                                <label className="settings-label">Ses Hassasiyeti</label>
                                <div className="settings-slider-wrapper">
                                    <input
                                        type="range"
                                        className="settings-slider"
                                        min="0" max="100"
                                        value={settings.sensitivity}
                                        onChange={(e) => updateSetting('sensitivity', e.target.value)}
                                    />
                                    <span>{settings.sensitivity}</span>
                                </div>
                            </div>
                        </div>
                    </>
                );
        }
    }

    return (
        <div className="settings-overlay">
            <div className="settings-sidebar">
                <div className="settings-nav">
                    <h3>Kullanıcı Ayarları</h3>
                    <div className={`settings-nav-item ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>Hesabım</div>
                    <div className={`settings-nav-item ${activeTab === 'voice' ? 'active' : ''}`} onClick={() => setActiveTab('voice')}>Ses ve Görüntü</div>
                    <div className={`settings-nav-item ${activeTab === 'appearance' ? 'active' : ''}`} onClick={() => setActiveTab('appearance')}>Görünüm</div>
                </div>
            </div>

            <div className="settings-content-wrapper">
                {renderContent()}
            </div>

            <div className="settings-close" onClick={onClose}>
                <div className="settings-close-circle">
                    <FaTimes size={18} />
                </div>
                <span>ESC</span>
            </div>
        </div>
    );
}
