import React, { useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { FaComment, FaMicrophone, FaVideo, FaBan, FaTimes } from 'react-icons/fa';
import { useClickOutside } from '../hooks/useClickOutside';
import { useSound } from '../contexts/SoundContext';
import '../styles/contextMenu.css';

interface UserContextMenuProps {
    user: {
        uid: string;
        displayName: string;
        photoURL?: string;
        isOnline?: boolean;
    };
    position: { x: number; y: number };
    onClose: () => void;
    onSendMessage: (userId: string) => void;
    onVoiceCall: (userId: string) => void;
    onVideoCall: (userId: string) => void;
    onBlockUser: (userId: string) => void;
}

export default function UserContextMenu({
    user,
    position,
    onClose,
    onSendMessage,
    onVoiceCall,
    onVideoCall,
    onBlockUser
}: UserContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const { playSound } = useSound();

    useClickOutside(menuRef, onClose);

    useEffect(() => {
        if (menuRef.current) {
            const menu = menuRef.current;
            const rect = menu.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Adjust position if menu goes off-screen
            let adjustedX = position.x;
            let adjustedY = position.y;

            if (position.x + rect.width > viewportWidth) {
                adjustedX = viewportWidth - rect.width - 10;
            }

            if (position.y + rect.height > viewportHeight) {
                adjustedY = viewportHeight - rect.height - 10;
            }

            menu.style.left = `${adjustedX}px`;
            menu.style.top = `${adjustedY}px`;
        }
    }, [position]);

    const menuItems = [
        {
            icon: <FaComment />,
            label: 'Mesaj Gönder',
            onClick: () => {
                playSound('click');
                onSendMessage(user.uid);
                onClose();
            },
            gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        },
        {
            icon: <FaMicrophone />,
            label: 'Sesli Arama',
            onClick: () => {
                playSound('call_start');
                onVoiceCall(user.uid);
                onClose();
            },
            gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'
        },
        {
            icon: <FaVideo />,
            label: 'Görüntülü Arama',
            onClick: () => {
                playSound('call_start');
                onVideoCall(user.uid);
                onClose();
            },
            gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
        },
        {
            icon: <FaBan />,
            label: 'Kullanıcıyı Engelle',
            onClick: () => {
                playSound('click');
                onBlockUser(user.uid);
                onClose();
            },
            gradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            isDanger: true
        }
    ];

    return ReactDOM.createPortal(
        <div className="user-context-menu" ref={menuRef}>
            <div className="context-menu-header">
                <div className="context-menu-user-info">
                    {user.photoURL ? (
                        <img src={user.photoURL} alt="" className="context-menu-avatar" />
                    ) : (
                        <div className="context-menu-avatar-placeholder">
                            {user.displayName?.charAt(0) || '?'}
                        </div>
                    )}
                    <div className="context-menu-user-details">
                        <div className="context-menu-username">{user.displayName}</div>
                        <div className="context-menu-status">
                            <div className={`status-indicator ${user.isOnline ? 'online' : 'offline'}`} />
                            {user.isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
                        </div>
                    </div>
                </div>
                <button className="context-menu-close" onClick={onClose}>
                    <FaTimes />
                </button>
            </div>
            <div className="context-menu-items">
                {menuItems.map((item, index) => (
                    <button
                        key={index}
                        className={`context-menu-item ${item.isDanger ? 'danger' : ''}`}
                        onClick={item.onClick}
                        style={{ '--item-gradient': item.gradient } as React.CSSProperties}
                    >
                        <span className="context-menu-item-icon">{item.icon}</span>
                        <span className="context-menu-item-label">{item.label}</span>
                    </button>
                ))}
            </div>
        </div>,
        document.body
    );
}
