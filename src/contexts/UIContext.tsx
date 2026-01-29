import React, { createContext, useContext, useState, type ReactNode } from 'react';
import GlobalModal from '../components/GlobalModal';

interface UIContextType {
    showAlert: (title: string, message: string) => void;
    showConfirm: (title: string, message: string, onConfirm: () => void, confirmText?: string, isDanger?: boolean) => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export const useUI = () => {
    const context = useContext(UIContext);
    if (!context) throw new Error('useUI must be used within UIProvider');
    return context;
};

export const UIProvider = ({ children }: { children: ReactNode }) => {
    const [modal, setModal] = useState<{
        isOpen: boolean;
        type: 'alert' | 'confirm';
        title: string;
        message: string;
        confirmText?: string;
        onConfirm?: () => void;
        isDanger?: boolean;
    }>({
        isOpen: false,
        type: 'alert',
        title: '',
        message: ''
    });

    const showAlert = (title: string, message: string) => {
        setModal({
            isOpen: true,
            type: 'alert',
            title,
            message,
            confirmText: 'Tamam'
        });
    };

    const showConfirm = (title: string, message: string, onConfirm: () => void, confirmText = 'Onayla', isDanger = false) => {
        setModal({
            isOpen: true,
            type: 'confirm',
            title,
            message,
            onConfirm,
            confirmText,
            isDanger
        });
    };

    const closeModal = () => setModal(prev => ({ ...prev, isOpen: false }));

    return (
        <UIContext.Provider value={{ showAlert, showConfirm }}>
            {children}
            <GlobalModal
                isOpen={modal.isOpen}
                type={modal.type}
                title={modal.title}
                message={modal.message}
                confirmText={modal.confirmText}
                onConfirm={() => {
                    if (modal.onConfirm) modal.onConfirm();
                    closeModal();
                }}
                onClose={closeModal}
                isDanger={modal.isDanger}
            />
        </UIContext.Provider>
    );
};
