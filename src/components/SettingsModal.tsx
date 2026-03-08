import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes, FaCamera, FaChevronLeft } from 'react-icons/fa';
import Cropper from 'react-easy-crop';
import { useAuth } from '../contexts/AuthContext';
import { useUI } from '../contexts/UIContext';
import { doc, updateDoc } from 'firebase/firestore';
import { getCroppedImg } from '../utils/imageUtils';
import { useSound } from '../contexts/SoundContext';
import { useLanguage } from '../contexts/LanguageContext';
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
    const { language, setLanguage, t } = useLanguage();

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
            showAlert(t('success'), 'Kullanıcı adı başarıyla güncellendi!');
        } catch (err: any) {
            console.error("Name update error:", err);
            setIsSavingName(false);
            setIsSavingName(false);
            showAlert(t('error'), `Kullanıcı adı güncellenirken bir hata oluştu: ${err.message}`);
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
            showAlert(t('success'), 'Profil resmi başarıyla güncellendi!');
        } catch (err: any) {
            console.error("Upload error detail:", err);
            setUploading(false);
            setUploading(false);
            setUploadStatus('');
            showAlert(t('error'), `Resim yüklenirken bir hata oluştu: ${err.message}`);
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
                                <span>{t('back')}</span>
                            </button>
                            <h2>{t('my_account')}</h2>
                        </div>
                        <div className="settings-section">
                            <div className="account-profile-card">
                                <label
                                    htmlFor="avatar-upload"
                                    className="account-avatar-wrapper"
                                    style={{ cursor: uploading ? 'wait' : 'pointer', display: 'block' }}
                                >
                                    {userData?.photoURL ? (
                                        <img src={userData.photoURL} alt="Avatar" className="large-avatar" />
                                    ) : (
                                        <div className="large-avatar placeholder">
                                            {userData?.displayName?.charAt(0) || currentUser?.email?.charAt(0)}
                                        </div>
                                    )}
                                    <div className="avatar-overlay" style={{ pointerEvents: 'none' }}>
                                        <FaCamera />
                                        <span>{t('change_avatar')}</span>
                                    </div>
                                    {uploading && <div className="upload-spinner" />}
                                    <input
                                        id="avatar-upload"
                                        type="file"
                                        ref={fileInputRef}
                                        style={{ display: 'none' }}
                                        accept="image/*"
                                        disabled={uploading}
                                        onChange={onFileChange}
                                    />
                                </label>
                                <div className="account-info-header">
                                    <span className="account-username">{userData?.displayName || 'Kullanıcı'}</span>
                                    <span className="account-tag">#0001</span>
                                </div>
                            </div>

                            <div className="settings-field" style={{ marginTop: '24px' }}>
                                <label className="settings-label">{t('username_label')}</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input
                                        className="settings-input"
                                        value={newDisplayName}
                                        onChange={(e) => setNewDisplayName(e.target.value)}
                                        placeholder={t('username_label')}
                                    />
                                    {newDisplayName !== userData?.displayName && (
                                        <button
                                            className="btn-primary"
                                            style={{ padding: '0 20px', height: '40px', fontSize: '12px' }}
                                            onClick={handleSaveDisplayName}
                                            disabled={isSavingName}
                                        >
                                            {isSavingName ? t('saving') : t('save')}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="settings-field">
                                <label className="settings-label">{t('email_label')}</label>
                                <input className="settings-input" value={currentUser?.email || ''} disabled style={{ opacity: 0.6 }} />
                            </div>

                            <button
                                className="settings-input"
                                style={{ background: 'var(--danger)', color: 'white', cursor: 'pointer', fontWeight: 'bold', height: '40px', marginTop: '20px' }}
                                onClick={logoutCurrent}
                            >
                                {t('logout')}
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
                                <span>{t('back')}</span>
                            </button>
                            <h2>{t('appearance')}</h2>
                        </div>
                        <div className="settings-section">
                            <h4>{t('theme_label').toUpperCase()}</h4>
                            <div className="settings-field">
                                <label className="settings-label">{t('theme_label')}</label>
                                <select
                                    className="settings-select"
                                    value={settings.theme}
                                    onChange={(e) => updateSetting('theme', e.target.value)}
                                >
                                    <option value="dark">{t('theme_dark')}</option>
                                    <option value="light">{t('theme_light')}</option>
                                </select>
                            </div>

                            <h4 style={{ marginTop: '24px' }}>{t('language').toUpperCase()}</h4>
                            <div className="settings-field">
                                <label className="settings-label">{t('language')}</label>
                                <select
                                    className="settings-select"
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value as any)}
                                >
                                    <option value="tr">Türkçe</option>
                                    <option value="en">English</option>
                                    <option value="de">Deutsch</option>
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
                                <span>{t('back')}</span>
                            </button>
                            <h2>{t('voice_video')}</h2>
                        </div>

                        <div className="settings-section">
                            <h4>{t('voice_video').toUpperCase()}</h4>

                            <div className="settings-field">
                                <label className="settings-label">{t('input_device')}</label>
                                <select
                                    className="settings-select"
                                    value={settings.inputId}
                                    onChange={(e) => updateSetting('inputId', e.target.value)}
                                >
                                    {devices.filter(d => d.kind === 'audioinput').map(d => (
                                        <option key={d.deviceId} value={d.deviceId}>{d.label || `${t('input_device')} ${d.deviceId.slice(0, 5)}`}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="settings-field">
                                <label className="settings-label">{t('input_volume')}</label>
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
                                <label className="settings-label">{t('output_device')}</label>
                                <select
                                    className="settings-select"
                                    value={settings.outputId}
                                    onChange={(e) => updateSetting('outputId', e.target.value)}
                                >
                                    {devices.filter(d => d.kind === 'audiooutput').map(d => (
                                        <option key={d.deviceId} value={d.deviceId}>{d.label || `${t('output_device')} ${d.deviceId.slice(0, 5)}`}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="settings-field">
                                <label className="settings-label">{t('output_volume')}</label>
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
                            <h4>{t('advanced')}</h4>

                            <div className="settings-toggle-wrapper">
                                <div>
                                    <div style={{ color: 'var(--text-header)' }}>{t('echo_cancellation')}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('echo_cancellation')}</div>
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
                                    <div style={{ color: 'var(--text-header)' }}>{t('noise_suppression')}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('noise_suppression')}</div>
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
                                <label className="settings-label">{t('sensitivity')}</label>
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
                            <h4>{t('notifications_sounds')}</h4>
                            <div className="settings-toggle-wrapper">
                                <div>
                                    <div style={{ color: 'var(--text-header)' }}>{t('sound_effects')}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('sound_effects')}</div>
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
                                <label className="settings-label">{t('sound_effects')}</label>
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
                                        {t('test_btn')}
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
                        <h3>{t('user_settings')}</h3>
                        <button
                            type="button"
                            className={`settings-nav-item ${activeTab === 'account' ? 'active' : ''}`}
                            onClick={() => { playSound('click'); setActiveTab('account'); }}
                            style={{ background: 'none', border: 'none', textAlign: 'left', width: '100%', font: 'inherit', cursor: 'pointer' }}
                        >{t('my_account')}</button>
                        <button
                            type="button"
                            className={`settings-nav-item ${activeTab === 'voice' ? 'active' : ''}`}
                            onClick={() => { playSound('click'); setActiveTab('voice'); }}
                            style={{ background: 'none', border: 'none', textAlign: 'left', width: '100%', font: 'inherit', cursor: 'pointer' }}
                        >{t('voice_video')}</button>
                        <button
                            type="button"
                            className={`settings-nav-item ${activeTab === 'appearance' ? 'active' : ''}`}
                            onClick={() => { playSound('click'); setActiveTab('appearance'); }}
                            style={{ background: 'none', border: 'none', textAlign: 'left', width: '100%', font: 'inherit', cursor: 'pointer' }}
                        >{t('appearance')}</button>
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
                            <button className="btn-secondary" onClick={() => setImage(null)} disabled={uploading}>{t('cancel')}</button>
                            <button className="btn-primary" onClick={handleAvatarUpload} disabled={uploading}>
                                {uploading ? uploadStatus : t('save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}
