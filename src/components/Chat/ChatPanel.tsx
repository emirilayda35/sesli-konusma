import React, { useState, useEffect, useRef } from 'react';
import { useRoomMessages } from '../../hooks/useRoomMessages';
import { useAuth } from '../../contexts/AuthContext';
import { FaPaperPlane, FaTimes, FaSmile, FaSearch } from 'react-icons/fa';
import EmojiPicker from 'emoji-picker-react';

const TENOR_API_KEY = 'LIVDSRZULELA';

interface ChatPanelProps {
    roomId: string;
    onClose?: () => void;
}

export default function ChatPanel({ roomId, onClose }: ChatPanelProps) {
    const { messages, sendMessage, sendMediaMessage } = useRoomMessages(roomId);
    const { currentUser } = useAuth();
    const [inputText, setInputText] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [gifSearch, setGifSearch] = useState('');
    const [gifs, setGifs] = useState<any[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!showGifPicker) return;
        const fetchGifs = async () => {
            try {
                const endpoint = gifSearch.trim()
                    ? `https://g.tenor.com/v1/search?q=${encodeURIComponent(gifSearch)}&key=${TENOR_API_KEY}&limit=20`
                    : `https://g.tenor.com/v1/trending?key=${TENOR_API_KEY}&limit=20`;
                const res = await fetch(endpoint);
                const data = await res.json();
                if (data && data.results) {
                    setGifs(data.results);
                }
            } catch (error) {
                console.error("Error fetching GIFs:", error);
            }
        };
        const timeoutId = setTimeout(fetchGifs, 500); // Debounce
        return () => clearTimeout(timeoutId);
    }, [gifSearch, showGifPicker]);

    useEffect(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputText.trim()) {
            sendMessage(inputText);
            setInputText('');
        }
    };

    return (
        <div className="chat-panel" style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(20, 20, 20, 0.95)',
            borderLeft: '1px solid rgba(255,255,255,0.1)'
        }}>
            <div className="chat-header" style={{
                padding: '15px',
                borderBottom: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Sohbet</h3>
                {onClose && (
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>
                        <FaTimes />
                    </button>
                )}
            </div>

            <div className="messages-list" style={{
                flex: 1,
                overflowY: 'auto',
                padding: '15px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
            }}>
                {messages.map(msg => {
                    const isOwn = msg.senderId === currentUser?.uid;
                    return (
                        <div key={msg.id} style={{
                            display: 'flex',
                            gap: '10px',
                            flexDirection: isOwn ? 'row-reverse' : 'row',
                            alignSelf: isOwn ? 'flex-end' : 'flex-start',
                            maxWidth: '85%'
                        }}>
                            {/* Avatar */}
                            <div style={{ width: 32, height: 32, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px' }}>
                                {msg.photoURL ? (
                                    <img src={msg.photoURL} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <span>{msg.senderName.charAt(0)}</span>
                                )}
                            </div>

                            {/* Bubble */}
                            <div style={{
                                background: msg.type === 'gif' ? 'transparent' : (isOwn ? 'var(--brand)' : 'var(--bg-tertiary)'),
                                padding: msg.type === 'gif' ? '0' : '8px 12px',
                                borderRadius: isOwn ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                                fontSize: '0.9rem',
                                color: 'white',
                                overflow: 'hidden'
                            }}>
                                {msg.type !== 'gif' && <div style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: 2 }}>{msg.senderName}</div>}
                                {msg.type === 'gif' && msg.mediaUrl ? (
                                    <div style={{ position: 'relative' }}>
                                        <div style={{ position: 'absolute', top: 6, left: 10, fontSize: '0.75rem', background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '10px', backdropFilter: 'blur(4px)', zIndex: 2 }}>{msg.senderName}</div>
                                        <img src={msg.mediaUrl} alt="GIF" style={{ maxWidth: '100%', borderRadius: '12px', display: 'block' }} />
                                    </div>
                                ) : (
                                    <div>{msg.content}</div>
                                )}
                            </div>
                        </div>
                    );
                })}
                <div ref={scrollRef} />
            </div>

            <div style={{ position: 'relative' }}>
                {showEmojiPicker && (
                    <div style={{ position: 'absolute', bottom: '100%', left: 0, zIndex: 1000, paddingBottom: '10px' }}>
                        <div style={{ position: 'relative' }}>
                            <button onClick={() => setShowEmojiPicker(false)} style={{ position: 'absolute', top: 5, right: 5, zIndex: 10, background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><FaTimes size={12} /></button>
                            <EmojiPicker
                                theme={"dark" as any}
                                onEmojiClick={(emojiData) => {
                                    setInputText(prev => prev + emojiData.emoji);
                                }}
                            />
                        </div>
                    </div>
                )}
                {showGifPicker && (
                    <div style={{ position: 'absolute', bottom: '100%', left: 0, zIndex: 1000, paddingBottom: '10px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', padding: '10px', background: 'var(--bg-primary)', borderBottom: '1px solid rgba(255,255,255,0.1)', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ color: 'white', fontWeight: 600, fontSize: '0.9rem' }}>GIF Ara (Tenor)</span>
                                <button onClick={() => setShowGifPicker(false)} style={{ background: 'transparent', color: 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer', display: 'flex' }}><FaTimes /></button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '4px 8px' }}>
                                <FaSearch size={12} color="rgba(255,255,255,0.4)" />
                                <input
                                    type="text"
                                    placeholder="Arama yap..."
                                    value={gifSearch}
                                    onChange={e => setGifSearch(e.target.value)}
                                    style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', padding: '4px 8px', width: '100%', fontSize: '0.85rem' }}
                                />
                            </div>
                        </div>
                        <div style={{ height: '300px', width: '280px', overflowY: 'auto', padding: '6px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px' }}>
                                {gifs.map((gif) => (
                                    <div
                                        key={gif.id}
                                        style={{ width: '100%', cursor: 'pointer', overflow: 'hidden', borderRadius: '4px', background: 'rgba(255,255,255,0.05)' }}
                                        onClick={() => {
                                            sendMediaMessage('gif', gif.media[0].gif.url);
                                            setShowGifPicker(false);
                                            setGifSearch('');
                                        }}
                                    >
                                        <img src={gif.media[0].tinygif.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                                    </div>
                                ))}
                                {gifs.length === 0 && (
                                    <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                                        GIF bulunamadı
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} style={{
                padding: '15px',
                paddingBottom: isMobile ? '100px' : '15px',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                gap: '10px',
                alignItems: 'center'
            }}>
                <button
                    type="button"
                    onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowGifPicker(false); }}
                    style={{ background: 'transparent', border: 'none', color: showEmojiPicker ? 'var(--brand)' : 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', transition: 'color 0.2s' }}
                    title="Emoji Gönder"
                >
                    <FaSmile size={22} />
                </button>
                <button
                    type="button"
                    onClick={() => { setShowGifPicker(!showGifPicker); setShowEmojiPicker(false); }}
                    style={{ background: 'transparent', color: showGifPicker ? 'var(--brand)' : 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', transition: 'color 0.2s', fontWeight: 800, fontSize: '0.8rem', alignItems: 'center', justifyContent: 'center', border: '2px solid', borderRadius: '4px', padding: '2px 4px' }}
                    title="GIF Gönder"
                >
                    GIF
                </button>
                <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Bir şeyler yaz..."
                    style={{
                        flex: 1,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '20px',
                        padding: '10px 15px',
                        color: 'white',
                        outline: 'none'
                    }}
                />
                <button type="submit" disabled={!inputText.trim()} style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: inputText.trim() ? 'var(--brand)' : 'rgba(255,255,255,0.1)',
                    border: 'none', color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: inputText.trim() ? 'pointer' : 'default',
                    transition: 'all 0.2s'
                }}>
                    <FaPaperPlane size={14} />
                </button>
            </form>
        </div>
    );
}
