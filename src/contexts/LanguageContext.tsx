import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type Language = 'tr' | 'en' | 'de';

interface Translations {
    [key: string]: {
        [key in Language]: string;
    };
}

const translations: Translations = {
    // Common
    'back': { tr: 'Geri', en: 'Back', de: 'Zurück' },
    'cancel': { tr: 'İPTAL', en: 'CANCEL', de: 'ABBRECHEN' },
    'ok': { tr: 'Tamam', en: 'OK', de: 'OK' },
    'confirm': { tr: 'Onayla', en: 'Confirm', de: 'Bestätigen' },
    'save': { tr: 'KAYDET', en: 'SAVE', de: 'SPEICHERN' },
    'saving': { tr: 'KAYDEDİLİYOR...', en: 'SAVING...', de: 'SPEICHERN...' },
    'success': { tr: 'Başarılı', en: 'Success', de: 'Erfolg' },
    'error': { tr: 'Hata', en: 'Error', de: 'Fehler' },
    'loading': { tr: 'Yükleniyor...', en: 'Loading...', de: 'Laden...' },

    // Sidebar
    'voice_channels': { tr: 'SESLİ KANALLAR', en: 'VOICE CHANNELS', de: 'SPRACHKANÄLE' },
    'message_groups': { tr: 'MESAJ GRUPLARI', en: 'MESSAGE GROUPS', de: 'NACHRICHTENGRUPPEN' },
    'online': { tr: 'Çevrimiçi', en: 'Online', de: 'Online' },
    'user_settings': { tr: 'Kullanıcı Ayarları', en: 'User Settings', de: 'Benutzereinstellungen' },
    'switch_account': { tr: 'Hesap Değiştir', en: 'Switch Account', de: 'Konto wechseln' },
    'accounts': { tr: 'HESAPLAR', en: 'ACCOUNTS', de: 'KONTEN' },
    'current_account': { tr: 'Şu anki', en: 'Current', de: 'Aktuell' },
    'switch_to': { tr: 'Geçiş yap', en: 'Switch to', de: 'Wechseln zu' },
    'add_account': { tr: 'Yeni hesap ekle', en: 'Add new account', de: 'Neues Konto hinzufügen' },
    'logout': { tr: 'Oturumu Kapat', en: 'Logout', de: 'Abmelden' },
    'create_room_prompt': { tr: 'Oda ismi girin:', en: 'Enter room name:', de: 'Raumnamen eingeben:' },
    'rename_group_prompt': { tr: 'Grubun yeni ismini girin:', en: 'Enter new group name:', de: 'Neuen Gruppennamen eingeben:' },
    'leave_group_confirm_title': { tr: 'Gruptan Ayrıl', en: 'Leave Group', de: 'Gruppe verlassen' },
    'leave_group_confirm_msg': { tr: 'Bu gruptan ayrılmak istediğinize emin misiniz?', en: 'Are you sure you want to leave this group?', de: 'Sind Sie sicher, dass Sie diese Gruppe verlassen möchten?' },
    'delete_group_confirm_title': { tr: 'Grubu Sil', en: 'Delete Group', de: 'Gruppe löschen' },
    'delete_group_confirm_msg': { tr: 'Bu grubu silmek istediğinize emin misiniz? Bu işlem geri alınamaz.', en: 'Are you sure you want to delete this group? This action cannot be undone.', de: 'Sind Sie sicher, dass Sie diese Gruppe löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.' },

    // Settings
    'my_account': { tr: 'Hesabım', en: 'My Account', de: 'Mein Konto' },
    'voice_video': { tr: 'Ses ve Görüntü', en: 'Voice & Video', de: 'Sprache & Video' },
    'appearance': { tr: 'Görünüm', en: 'Appearance', de: 'Erscheinungsbild' },
    'language': { tr: 'Dil', en: 'Language', de: 'Sprache' },
    'change_avatar': { tr: 'DEĞİŞTİR', en: 'CHANGE', de: 'ÄNDERN' },
    'username_label': { tr: 'KULLANICI ADI', en: 'USERNAME', de: 'BENUTZERNAME' },
    'email_label': { tr: 'E-POSTA', en: 'EMAIL', de: 'E-MAIL' },
    'theme_label': { tr: 'Renk Teması', en: 'Color Theme', de: 'Farbschema' },
    'theme_dark': { tr: 'Koyu', en: 'Dark', de: 'Dunkel' },
    'theme_light': { tr: 'Açık', en: 'Light', de: 'Hell' },
    'input_device': { tr: 'Giriş Cihazı', en: 'Input Device', de: 'Eingabegerät' },
    'output_device': { tr: 'Çıkış Cihazı', en: 'Output Device', de: 'Ausgabegerät' },
    'input_volume': { tr: 'Giriş Ses Seviyesi', en: 'Input Volume', de: 'Eingabelautstärke' },
    'output_volume': { tr: 'Çıkış Ses Seviyesi', en: 'Output Volume', de: 'Ausgabelautstärke' },
    'advanced': { tr: 'GELİŞMİŞ', en: 'ADVANCED', de: 'ERWEITERT' },
    'echo_cancellation': { tr: 'Yankı Engelleme', en: 'Echo Cancellation', de: 'Echounterdrückung' },
    'noise_suppression': { tr: 'Gürültü Azaltma', en: 'Noise Suppression', de: 'Rauschunterdrückung' },
    'sensitivity': { tr: 'Ses Hassasiyeti', en: 'Voice Sensitivity', de: 'Sprachempfindlichkeit' },
    'notifications_sounds': { tr: 'BİLDİRİMLER VE SESLER', en: 'NOTIFICATIONS & SOUNDS', de: 'BENACHRICHTIGUNGEN & TÖNE' },
    'sound_effects': { tr: 'Ses Efektleri', en: 'Sound Effects', de: 'Soundeffekte' },
    'test_btn': { tr: 'TEST', en: 'TEST', de: 'TEST' },

    // VoiceRoom
    'invite': { tr: 'Davet Et', en: 'Invite', de: 'Einladen' },
    'chat': { tr: 'Sohbet', en: 'Chat', de: 'Chat' },
    'rotate': { tr: 'Döndür', en: 'Rotate', de: 'Drehen' },
    'fullscreen': { tr: 'Tam Ekran', en: 'Fullscreen', de: 'Vollbild' },
    'close': { tr: 'Kapat', en: 'Close', de: 'Schließen' },
    'mic_on': { tr: 'Mikrofonu Aç', en: 'Turn on Mic', de: 'Mikrofon einschalten' },
    'mic_off': { tr: 'Mikrofonu Kapat', en: 'Turn off Mic', de: 'Mikrofon ausschalten' },
    'cam_on': { tr: 'Kamerayı Aç', en: 'Turn on Camera', de: 'Kamera einschalten' },
    'cam_off': { tr: 'Kamerayı Kapat', en: 'Turn off Camera', de: 'Kamera ausschalten' },
    'screen_share_on': { tr: 'Ekranı Paylaş', en: 'Share Screen', de: 'Bildschirm teilen' },
    'screen_share_off': { tr: 'Paylaşımı Durdur', en: 'Stop Sharing', de: 'Teilen beenden' },
    'reconnect': { tr: 'Bağlantıyı Yenile', en: 'Reconnect', de: 'Neu verbinden' },
    'leave': { tr: 'Ayrıl', en: 'Leave', de: 'Verlassen' },
    'connecting': { tr: 'Odaya bağlanılıyor...', en: 'Connecting to room...', de: 'Verbindung zum Raum wird hergestellt...' },
    'unnamed': { tr: 'İsimsiz', en: 'Unnamed', de: 'Unbenannt' },
    'mute_mic': { tr: 'Mikrofonu Kapat', en: 'Mute Microphone', de: 'Mikrofon stummschalten' },
    'unmute_mic': { tr: 'Mikrofonu Aç', en: 'Unmute Microphone', de: 'Mikrofon einschalten' },
    'deafen': { tr: 'Sağılaştır', en: 'Deafen', de: 'Taub stellen' },
    'undeafen': { tr: 'Sesi Aç', en: 'Undeafen', de: 'Taub stellen aufheben' },
    'user': { tr: 'Kullanıcı', en: 'User', de: 'Benutzer' },
    'joined': { tr: 'katıldı', en: 'joined', de: 'ist beigetreten' },
    'left': { tr: 'ayrıldı', en: 'left', de: 'hat verlassen' },
    'maximize': { tr: 'Büyüt', en: 'Maximize', de: 'Maximieren' },
    'people': { tr: 'kişi', en: 'people', de: 'Personen' },
    'you': { tr: 'Sen', en: 'You', de: 'Du' },
    'flip_camera': { tr: 'Kamerayı Çevir', en: 'Flip Camera', de: 'Kamera drehen' },
    'conflict': { tr: 'Çakışma', en: 'Conflict', de: 'Konflikt' },
    'camera_screen_conflict': { tr: 'Ekran paylaşımı aktifken kamera açılamaz. Önce ekran paylaşımını durdurun.', en: 'Camera cannot be opened while screen sharing is active. Stop screen sharing first.', de: 'Die Kamera kann nicht geöffnet werden, während die Bildschirmfreigabe aktiv ist. Beenden Sie zuerst die Bildschirmfreigabe.' },
    'screen_camera_conflict': { tr: 'Kamera açıkken ekran paylaşımı başlatılamaz. Önce kamerayı kapatın.', en: 'Screen sharing cannot be started while camera is on. Turn off the camera first.', de: 'Die Bildschirmfreigabe kann nicht gestartet werden, wenn die Kamera eingeschaltet ist. Schalten Sie zuerst die Kamera aus.' },
    'invite_message_prefix': { tr: 'Seni sesli/görüntülü sohbete davet ediyorum! Katılmak için tıkla:', en: 'I invite you to a voice/video chat! Click to join:', de: 'Ich lade dich zu einem Sprach-/Video-Chat ein! Klicke zum Beitreten:' },
    'invite_sent_to': { tr: '{name} adlı kullanıcıya davet gönderildi!', en: 'Invite sent to {name}!', de: 'Einladung an {name} gesendet!' },
    'invite_send_error': { tr: 'Davet gönderilirken bir hata oluştu.', en: 'An error occurred while sending the invite.', de: 'Beim Senden der Einladung ist ein Fehler aufgetreten.' },
    'invite_friends': { tr: 'Arkadaşlarını Davet Et', en: 'Invite Friends', de: 'Freunde einladen' },
    'no_friends_yet': { tr: 'Henüz arkadaşınız bulunmuyor.', en: 'You have no friends yet.', de: 'Du hast noch keine Freunde.' },
    'invite_link_copied': { tr: 'Davet linki kopyalandı!', en: 'Invite link copied!', de: 'Einladungslink kopiert!' },
    'copy_link': { tr: 'Linki Kopyala', en: 'Copy Link', de: 'Link kopieren' },
    'invite_from_friends': { tr: 'Arkadaş Listesinden Davet Et', en: 'Invite from Friends List', de: 'Aus der Freundesliste einladen' },

    // Banner
    'ongoing_call': { tr: 'Devam eden arama — Görüntülemek için tıklayın', en: 'Ongoing call — Click to view', de: 'Laufender Anruf — Zum Anzeigen klicken' },
    'connection': { tr: 'Bağlantı', en: 'Connection', de: 'Verbindung' },
    'reconnecting_message': { tr: 'Bağlantı yenileniyor...', en: 'Reconnecting...', de: 'Verbindung wird neu aufgebaut...' },
    'welcome': { tr: 'Hoş Geldin!', en: 'Welcome!', de: 'Willkommen!' },
    'welcome_subtitle': { tr: 'Arkadaşlarını bul ve sohbete başla.', en: 'Find your friends and start chatting.', de: 'Finde deine Freunde und beginne zu chatten.' },
    'group_call_invite_title': { tr: 'sizi grup aramasına davet ediyor', en: 'is inviting you to a group call', de: 'lädt dich zu einem Gruppenanruf ein' },
    'click_to_join': { tr: 'Katılmak için tıklayın', en: 'Click to join', de: 'Klicken zum Beitreten' },
    'write_message': { tr: 'Bir mesaj yaz...', en: 'Type a message...', de: 'Schreibe eine Nachricht...' },
    'send': { tr: 'Gönder', en: 'Send', de: 'Senden' },
    'delete_message': { tr: 'Mesajı sil', en: 'Delete message', de: 'Nachricht löschen' },
    'read_by_all': { tr: 'Herkes tarafından okundu', en: 'Read by all', de: 'Von allen gelesen' },
    'delivered': { tr: 'İletildi', en: 'Delivered', de: 'Zugestellt' },
    'replying_to': { tr: 'kullanıcısına yanıt veriyorsun', en: 'replying to', de: 'antwortet auf' },
    'search_gif': { tr: 'GIF Ara (Tenor)', en: 'Search GIF (Tenor)', de: 'GIF suchen (Tenor)' },
    'search_placeholder': { tr: 'Arama yap...', en: 'Search...', de: 'Suche...' },
    'gif_not_found': { tr: 'GIF bulunamadı', en: 'No GIF found', de: 'Keine GIF gefunden' },
    'attach_file': { tr: 'Dosya Ekle', en: 'Attach File', de: 'Datei anhängen' },
    'send_emoji': { tr: 'Emoji Gönder', en: 'Send Emoji', de: 'Emoji senden' },
    'send_gif': { tr: 'GIF Gönder', en: 'Send GIF', de: 'GIF senden' },
    'confirm_upload': { tr: 'Gönderimi Onayla', en: 'Confirm Upload', de: 'Upload bestätigen' },
    'no_preview': { tr: 'Dosya Önizlemesi Yok', en: 'No Preview Available', de: 'Keine Vorschau verfügbar' },
    'media_label': { tr: 'Medya', en: 'Media', de: 'Medien' },
    'voice_message_label': { tr: 'Sesli Mesaj', en: 'Voice Message', de: 'Sprachnachricht' },
    'delete': { tr: 'Sil', en: 'Delete', de: 'Löschen' },
    'calling': { tr: 'Aranıyor', en: 'Calling', de: 'Anrufen' },
    'call_declined': { tr: '{name} aramayı reddetti.', en: '{name} declined the call.', de: '{name} hat den Anruf abgelehnt.' },
    'end_call': { tr: 'Aramayı Kapat', en: 'End Call', de: 'Anruf beenden' },
    'call': { tr: 'Arama', en: 'Call', de: 'Anruf' },
    'group_voice_call_label': { tr: 'GRUP SESLİ GÖRÜŞME', en: 'GROUP VOICE CALL', de: 'GRUPPEN-SPRACHANRUF' },
    'auto_decline_message': { tr: '{time}s içinde otomatik reddedilecek', en: 'Will be auto-declined in {time}s', de: 'Wird in {time}s automatisch abgelehnt' },
    'decline': { tr: 'Reddet', en: 'Decline', de: 'Ablehnen' },
    'join': { tr: 'Katıl', en: 'Join', de: 'Beitreten' },
};

interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string, vars?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>(() => {
        return (localStorage.getItem('settings_language') as Language) || 'tr';
    });

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem('settings_language', lang);
    };

    const t = (key: string, vars?: Record<string, string | number>): string => {
        if (!translations[key]) {
            console.warn(`Translation key missing: ${key}`);
            return key;
        }
        let text = translations[key][language] || translations[key]['tr'];
        if (vars) {
            Object.entries(vars).forEach(([k, v]) => {
                text = text.replace(`{${k}}`, String(v));
            });
        }
        return text;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLanguage() {
    const context = useContext(LanguageContext);
    if (context === undefined) {
        throw new Error('useLanguage must be used within a LanguageProvider');
    }
    return context;
}
