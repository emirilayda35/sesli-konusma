import React from 'react';
import { FaExclamationTriangle, FaTimes, FaInfoCircle } from 'react-icons/fa';

interface GlobalModalProps {
    isOpen: boolean;
    type: 'alert' | 'confirm';
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onClose: () => void;
    isDanger?: boolean;
}

export default function GlobalModal({
    isOpen,
    type,
    title,
    message,
    confirmText = 'Tamam',
    cancelText = 'İptal',
    onConfirm,
    onClose,
    isDanger = false
}: GlobalModalProps) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {isDanger ? (
                            <FaExclamationTriangle style={{ color: 'var(--danger)' }} />
                        ) : (
                            <FaInfoCircle style={{ color: 'var(--brand)' }} />
                        )}
                        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{title}</h3>
                    </div>
                    <button className="modal-close-btn" onClick={onClose}>
                        <FaTimes />
                    </button>
                </div>
                <div className="modal-body">
                    <p style={{ color: 'var(--text-muted)', margin: 0 }}>{message}</p>
                </div>
                <div className="modal-footer">
                    {type === 'confirm' && (
                        <button className="btn-secondary" onClick={onClose}>
                            {cancelText}
                        </button>
                    )}
                    <button
                        className={isDanger ? "btn-danger" : "btn-primary"}
                        onClick={onConfirm}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
