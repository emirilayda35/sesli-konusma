import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes, FaCamera, FaChevronLeft } from 'react-icons/fa';
import Cropper from 'react-easy-crop';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { doc, updateDoc } from 'firebase/firestore';
import { getCroppedImg } from '../utils/imageUtils';
import { useSound } from '../contexts/SoundContext';
import '../styles/settings.css';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: string;
}

export default function SettingsModal({ isOpen, onClose, initialTab = 'voice' }: SettingsModalProps) {
    const { currentUser, userData, logoutCurrent, db } = useAuth();
    const { showAlert } = useUI();
    const [activeTab, setActiveTab] = useState(initialTab);
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string>('');
    const { playSound, settings: soundSettings, updateSettings: updateSoundSettings } = useSound();

    // Username change states
    const [newDisplayName, setNewDisplayName] = useState(userData?.displayName || '');
    const [isSavingName, setIsSavingName] = useState(false);

    // Update active tab and name when modal is opened
    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
            setNewDisplayName(userData?.displayName || '');
        }
    }, [isOpen, initialTab, userData?.displayName]);

    // Cropping States
    const [image, setImage] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
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
        window.dispatchEvent(new CustomEvent('voice_settings_updated', { detail: { key, value } }));
    };

    const handleSaveDisplayName = async () => {
        if (!currentUser || !newDisplayName.trim()) return;
        if (newDisplayName === userData?.displayName) return;

        try {
            setIsSavingName(true);
            await updateDoc(doc(db, 'users', currentUser.uid), {
                displayName: newDisplayName.trim()
            });
            setIsSavingName(false);
            showAlert('Başarılı', 'Kullanıcı adı başarıyla güncellendi!');
        } catch (err: any) {
            console.error("Name update error:", err);
            setIsSavingName(false);
            showAlert('Hata', `Kullanıcı adı güncellenirken bir hata oluştu: ${err.message}`);
        }
    };

    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const imageDataUrl = URL.createObjectURL(file);
            setImage(imageDataUrl);
        }
    };

    const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    }, []);

    const handleAvatarUpload = async () => {
        if (!image || !croppedAreaPixels || !currentUser) return;

        try {
            setUploading(true);
            setUploadStatus('Hazırlanıyor...');

            const base64Image = await getCroppedImg(image, croppedAreaPixels);

            if (!base64Image) {
                throw new Error("Kırpma işlemi başarısız oldu.");
            }

            setUploadStatus('Kaydediliyor...');
            await updateDoc(doc(db, 'users', currentUser.uid), {
                photoURL: base64Image
            });

            setUploading(false);
            setUploadStatus('');
            setImage(null);
            showAlert('Başarılı', 'Profil resmi başarıyla güncellendi!');
        } catch (err: any) {
            console.error("Upload error detail:", err);
            setUploading(false);
            setUploadStatus('');
            showAlert('Hata', `Resim yüklenirken bir hata oluştu: ${err.message}`);
        }
    };

    if (!isOpen) return null;

    const renderContent = () => {
        switch (activeTab) {
            case 'account':
                return (
                    <>
                        <div className="settings-header">
                            <button className="back-button" onClick={onClose}>
                                <FaChevronLeft size={16} />
                                <span>Geri</span>
                            </button>
                            <h2>Hesabım</h2>
                        </div>
                        <div className="settings-section">
                            <div className="account-profile-card">
                                <div
                                    className="account-avatar-wrapper"
                                    onClick={() => !uploading && fileInputRef.current?.click()}
                                    style={{ cursor: uploading ? 'wait' : 'pointer' }}
                                >
                                    {userData?.photoURL ? (
                                        <img src={userData.photoURL} alt="Avatar" className="large-avatar" />
                                    ) : (
                                        <div className="large-avatar placeholder">
                                            {userData?.displayName?.charAt(0) || currentUser?.email?.charAt(0)}
                                        </div>
                                    )}
                                    <div className="avatar-overlay">
                                        <FaCamera />
                                        <span>DEĞİŞTİR</span>
                                    </div>
                                    {uploading && <div className="upload-spinner" />}
                                </div>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    accept="image/*"
                                    onChange={onFileChange}
                                />
                                <div className="account-info-header">
                                    <span className="account-username">{userData?.displayName || 'Kullanıcı'}</span>
                                    <span className="account-tag">#0001</span>
                                </div>
                            </div>

                            <div className="settings-field" style={{ marginTop: '24px' }}>
                                <label className="settings-label">KULLANICI ADI</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input
                                        className="settings-input"
                                        value={newDisplayName}
                                        onChange={(e) => setNewDisplayName(e.target.value)}
                                        placeholder="Kullanıcı adı girin"
                                    />
                                    {newDisplayName !== userData?.displayName && (
                                        <button
                                            className="btn-primary"
                                            style={{ padding: '0 20px', height: '40px', fontSize: '12px' }}
                                            onClick={handleSaveDisplayName}
                                            disabled={isSavingName}
                                        >
                                            {isSavingName ? 'KAYDEDİLİYOR...' : 'KAYDET'}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="settings-field">
                                <label className="settings-label">E-POSTA</label>
                                <input className="settings-input" value={currentUser?.email || ''} disabled style={{ opacity: 0.6 }} />
                            </div>

                            <button
                                className="settings-input"
                                style={{ background: 'var(--danger)', color: 'white', cursor: 'pointer', fontWeight: 'bold', height: '40px', marginTop: '20px' }}
                                onClick={logoutCurrent}
                            >
                                Oturumu Kapat
                            </button>
                        </div>
                    </>
                );
            case 'appearance':
                return (
                    <>
                        <div className="settings-header">
                            <button className="back-button" onClick={onClose}>
                                <FaChevronLeft size={16} />
                                <span>Geri</span>
                            </button>
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
                            <button className="back-button" onClick={onClose}>
                                <FaChevronLeft size={16} />
                                <span>Geri</span>
                            </button>
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
                                    onClick={() => {
                                        playSound('click');
                                        updateSetting('echoCancellation', !settings.echoCancellation);
                                    }}
                                />
                            </div>

                            <div className="settings-toggle-wrapper">
                                <div>
                                    <div style={{ color: 'var(--text-header)' }}>Gürültü Azaltma</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Arka plan gürültülerini filtreler.</div>
                                </div>
                                <div
                                    className={`settings-toggle ${settings.noiseSuppression ? 'on' : ''}`}
                                    onClick={() => {
                                        playSound('click');
                                        updateSetting('noiseSuppression', !settings.noiseSuppression);
                                    }}
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

                        <div className="settings-section">
                            <h4>BİLDİRİMLER VE SESLER</h4>
                            <div className="settings-toggle-wrapper">
                                <div>
                                    <div style={{ color: 'var(--text-header)' }}>Ses Efektleri</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Mesaj geldiğinde ve aramalarda ses çalar.</div>
                                </div>
                                <div
                                    className={`settings-toggle ${soundSettings.enabled ? 'on' : ''}`}
                                    onClick={() => {
                                        playSound('click');
                                        updateSoundSettings({ enabled: !soundSettings.enabled });
                                    }}
                                />
                            </div>
                            <div className="settings-field" style={{ marginTop: '12px' }}>
                                <label className="settings-label">Efekt Ses Seviyesi</label>
                                <div className="settings-slider-wrapper">
                                    <input
                                        type="range"
                                        className="settings-slider"
                                        min="0" max="1" step="0.1"
                                        value={soundSettings.volume}
                                        onChange={(e) => updateSoundSettings({ volume: parseFloat(e.target.value) })}
                                    />
                                    <span>%{Math.round(soundSettings.volume * 100)}</span>
                                    <button
                                        className="btn-primary"
                                        style={{ marginLeft: '10px', padding: '4px 12px', height: '28px', fontSize: '11px' }}
                                        onClick={() => playSound('click')}
                                    >
                                        TEST
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                );
        }
    };

    return createPortal(
        <>
            <div className="settings-overlay">
                <div className="settings-sidebar">
                    <div className="settings-nav">
                        <h3>Kullanıcı Ayarları</h3>
                        <div className={`settings-nav-item ${activeTab === 'account' ? 'active' : ''}`} onClick={() => { playSound('click'); setActiveTab('account'); }}>Hesabım</div>
                        <div className={`settings-nav-item ${activeTab === 'voice' ? 'active' : ''}`} onClick={() => { playSound('click'); setActiveTab('voice'); }}>Ses ve Görüntü</div>
                        <div className={`settings-nav-item ${activeTab === 'appearance' ? 'active' : ''}`} onClick={() => { playSound('click'); setActiveTab('appearance'); }}>Görünüm</div>
                    </div>
                </div>

                <div className="settings-content-wrapper">
                    {renderContent()}
                </div>

                <div className="settings-close" onClick={() => { playSound('click'); onClose(); }}>
                    <div className="settings-close-circle">
                        <FaTimes size={18} />
                    </div>
                    <span>ESC</span>
                </div>
            </div>

            {/* Cropper Modal Overlay */}
            {image && (
                <div className="cropper-overlay">
                    <div className="cropper-container">
                        <Cropper
                            image={image}
                            crop={crop}
                            zoom={zoom}
                            aspect={1}
                            cropShape="round"
                            showGrid={false}
                            onCropChange={setCrop}
                            onCropComplete={onCropComplete}
                            onZoomChange={setZoom}
                        />
                    </div>
                    <div className="cropper-controls">
                        <input
                            type="range"
                            value={zoom}
                            min={1}
                            max={3}
                            step={0.1}
                            aria-labelledby="Zoom"
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="cropper-slider"
                        />
                        <div className="cropper-btns">
                            <button className="btn-secondary" onClick={() => setImage(null)} disabled={uploading}>İPTAL</button>
                            <button className="btn-primary" onClick={handleAvatarUpload} disabled={uploading}>
                                {uploading ? uploadStatus : 'UYGULA VE YÜKLE'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}
