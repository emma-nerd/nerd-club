import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously,
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc,
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp 
} from 'firebase/firestore';

// Firebase Setup

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAiLHAahWkJJ5aXMEBJmRPv1UN3jwvL5Qg",
  authDomain: "nerdclub-c5eaf.firebaseapp.com",
  projectId: "nerdclub-c5eaf",
  storageBucket: "nerdclub-c5eaf.firebasestorage.app",
  messagingSenderId: "323147983197",
  appId: "1:323147983197:web:7f1e61a48a11fde18da0b4",
  measurementId: "G-DVJD1EX7HW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'the-hub-community';

const GENRES = [
  { id: 'fantasy', name: 'Fantasy', icon: '⚔️' },
  { id: 'scifi', name: 'Sci-Fi', icon: '🚀' },
  { id: 'mystery', name: 'Mystery', icon: '🕵️' },
  { id: 'romance', name: 'Romance', icon: '💖' },
  { id: 'nonfiction', name: 'Non-Fiction', icon: '🧠' }
];

const LANGUAGES = [
  { id: 'chinese', name: 'Chinese', icon: '🇨🇳' },
  { id: 'spanish', name: 'Spanish', icon: '🇪🇸' },
  { id: 'french', name: 'French', icon: '🇫🇷' },
  { id: 'japanese', name: 'Japanese', icon: '🇯🇵' },
  { id: 'korean', name: 'Korean', icon: '🇰🇷' },
  { id: 'german', name: 'German', icon: '🇩🇪' },
  { id: 'italian', name: 'Italian', icon: '🇮🇹' },
  { id: 'portuguese', name: 'Portuguese', icon: '🇵🇹' }
];

const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: '🏠' },
  { id: 'books', label: 'Readers Lounge', icon: '📚' },
  { id: 'writers', label: 'Writers Hub', icon: '✍️' },
  { id: 'languages', label: 'Language Exchange', icon: '🌐' },
  { id: 'support', label: 'Support Creator', icon: '💎' },
  { id: 'about', label: 'Our Story', icon: '✨' }
];

const PROFILE_COLORS = [
  'bg-indigo-600', 'bg-rose-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-600', 'bg-sky-500'
];

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('home');
  const [genre, setGenre] = useState('fantasy');
  const [selectedLang, setSelectedLang] = useState('chinese');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDMOpen, setIsDMOpen] = useState(false);
  const [dmList, setDmList] = useState([]);
  const [userProfile, setUserProfile] = useState({ displayName: 'Guest', color: 'bg-indigo-600', role: 'Reader' });
  const [isSaving, setIsSaving] = useState(false);
  
  const chatEndRef = useRef(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) { console.error("Auth error:", err); }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const profileRef = doc(db, 'artifacts', appId, 'users', u.uid, 'settings', 'profile');
        const snap = await getDoc(profileRef);
        if (snap.exists()) {
          setUserProfile(snap.data());
        } else {
          const initialProfile = { displayName: 'User_' + u.uid.slice(0, 4), color: 'bg-indigo-600', role: 'Reader' };
          await setDoc(profileRef, initialProfile);
          setUserProfile(initialProfile);
        }
        const dmRef = collection(db, 'artifacts', appId, 'users', u.uid, 'dm_contacts');
        const dmUnsub = onSnapshot(dmRef, (s) => {
          setDmList(s.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => console.error("DM listener error:", err));
        return () => dmUnsub();
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    let pathSegment = view === 'books' ? `books_${genre}` : view === 'writers' ? `writers_${genre}` : `langs_${selectedLang}`;
    if (!['books', 'writers', 'languages'].includes(view)) return;
    
    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', pathSegment), 
      orderBy('createdAt', 'asc'), 
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (s) => {
      setMessages(s.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.warn("Firestore error:", err));

    return () => unsubscribe();
  }, [user, view, genre, selectedLang]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handlePost = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    let pathSegment = view === 'books' ? `books_${genre}` : view === 'writers' ? `writers_${genre}` : `langs_${selectedLang}`;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', pathSegment), {
        text: newMessage,
        userId: user.uid,
        userName: userProfile.displayName || 'Guest',
        userColor: userProfile.color || 'bg-indigo-600',
        createdAt: serverTimestamp()
      });
      setNewMessage('');
    } catch (err) { console.error("Post error:", err); }
  };

  const saveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'profile'), userProfile);
      setView('home');
    } catch (err) { console.error(err); } finally { setIsSaving(false); }
  };

  const navigateTo = (v) => { 
    setView(v); 
    setIsMenuOpen(false); 
    setIsDMOpen(false); 
    window.scrollTo(0, 0);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col relative overflow-x-hidden">
      <header className="h-20 bg-white border-b border-slate-100 px-6 md:px-12 flex items-center justify-between sticky top-0 z-[500] backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-6">
          <button onClick={() => setIsMenuOpen(true)} className="p-3 hover:bg-slate-50 rounded-2xl transition-all active:scale-90">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h8m-8 6h16" /></svg>
          </button>
          <div className="text-2xl font-black italic tracking-tighter cursor-pointer select-none" onClick={() => navigateTo('home')}>HUB.</div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setIsDMOpen(true)} className="p-3 text-slate-400 hover:text-indigo-600 relative transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            <span className="absolute top-3 right-3 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
          </button>
          <button onClick={() => navigateTo('profile')} className={`w-10 h-10 rounded-full ${userProfile.color} flex items-center justify-center font-black text-white text-xs shadow-lg border-2 border-white transition-transform hover:scale-110`}>
            {(userProfile.displayName || 'U')[0]}
          </button>
        </div>
      </header>

      <div className={`fixed inset-0 bg-slate-950/60 z-[1000] transition-opacity duration-500 ${isMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`} onClick={() => setIsMenuOpen(false)} />
      <aside className={`fixed top-0 left-0 bottom-0 w-80 bg-white z-[1100] shadow-2xl transition-transform duration-500 ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="p-8 border-b flex justify-between items-center shrink-0">
            <span className="font-black text-indigo-600 uppercase italic tracking-widest">Navigation</span>
            <button onClick={() => setIsMenuOpen(false)} className="text-slate-300">✕</button>
        </div>
        <nav className="flex-1 overflow-y-auto p-6 space-y-2">
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => navigateTo(item.id)} className={`w-full text-left p-4 rounded-2xl font-black text-[12px] uppercase flex items-center gap-4 transition-all ${view === item.id ? 'bg-indigo-600 text-white shadow-xl' : 'hover:bg-slate-50 text-slate-500'}`}>
              <span className="text-xl">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className={`fixed inset-0 bg-slate-950/40 z-[1000] transition-opacity duration-300 ${isDMOpen ? 'opacity-100 visible' : 'opacity-0 invisible pointer-events-none'}`} onClick={() => setIsDMOpen(false)} />
      <aside className={`fixed top-0 right-0 bottom-0 w-80 bg-white z-[1100] shadow-2xl transition-transform duration-300 ${isDMOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}>
        <div className="p-8 border-b font-black text-rose-500 uppercase italic tracking-widest flex justify-between items-center shrink-0">
          <span>Private Hub</span>
          <button onClick={() => setIsDMOpen(false)} className="text-slate-300">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {dmList.length === 0 ? (
            <div className="text-center py-20 text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">No private messages.</div>
          ) : (
            dmList.map(contact => (
              <button key={contact.id} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 rounded-2xl transition-all">
                <div className={`w-10 h-10 rounded-full ${contact.color || 'bg-slate-200'} flex items-center justify-center text-white font-black text-xs`}>{(contact.displayName || 'U')[0]}</div>
                <div className="text-left">
                  <p className="font-black text-xs uppercase">{contact.displayName}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{contact.role}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative z-0">
        {view === 'home' && (
          <div className="flex-1 flex flex-col items-center justify-center py-24 text-center px-6">
            <div className="mb-6 inline-block px-4 py-1.5 bg-indigo-50 rounded-full text-indigo-600 font-black text-[10px] uppercase tracking-[0.3em]">Connected Universe</div>
            <h1 className="text-8xl md:text-9xl font-black italic tracking-tighter mb-4 leading-[0.85]">The <span className="text-indigo-600">Hub.</span></h1>
            <p className="text-slate-400 text-lg md:text-xl font-medium mb-20 max-w-2xl">The premier intersection for global readers, professional writers, and language enthusiasts.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl px-6">
              {[
                { id: 'books', name: 'Readers Lounge', icon: '📚', color: 'bg-blue-500' },
                { id: 'writers', name: 'Writers Hub', icon: '✍️', color: 'bg-indigo-600' },
                { id: 'languages', name: 'Languages', icon: '🌐', color: 'bg-emerald-500' }
              ].map(v => (
                <div key={v.id} onClick={() => navigateTo(v.id)} className="group p-12 bg-white border border-slate-100 rounded-[3.5rem] shadow-sm hover:shadow-2xl hover:-translate-y-3 transition-all cursor-pointer relative overflow-hidden">
                  <div className={`absolute top-0 right-0 w-32 h-32 ${v.color} opacity-0 group-hover:opacity-5 transition-opacity blur-3xl rounded-full -mr-10 -mt-10`}></div>
                  <div className="text-5xl mb-6 transform group-hover:scale-125 transition-transform duration-300">{v.icon}</div>
                  <h3 className="font-black text-xl uppercase tracking-tighter">{v.name}</h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">Enter Lounge</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'profile' && (
          <div className="flex-1 flex flex-col items-center justify-center py-12 px-6">
            <div className="w-full max-w-2xl bg-white rounded-[4rem] shadow-2xl border border-slate-100 p-8 md:p-16 flex flex-col gap-12">
              <div className="flex items-center gap-8">
                <div className={`w-24 h-24 rounded-full ${userProfile.color} flex items-center justify-center text-white text-4xl font-black shadow-2xl`}>
                  {(userProfile.displayName || 'U')[0]}
                </div>
                <div>
                  <h2 className="text-4xl font-black italic tracking-tighter uppercase leading-none mb-2">My <span className="text-indigo-600">Profile</span></h2>
                </div>
              </div>
              <div className="space-y-8">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-4">Display Name</label>
                  <input type="text" value={userProfile.displayName || ''} onChange={(e) => setUserProfile({...userProfile, displayName: e.target.value})} className="w-full bg-slate-50 rounded-3xl px-8 py-6 outline-none font-bold text-lg border-2 border-transparent focus:border-indigo-100 transition-all shadow-inner" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-4">Avatar Theme</label>
                  <div className="flex flex-wrap gap-4">
                    {PROFILE_COLORS.map(color => (
                      <button key={color} onClick={() => setUserProfile({...userProfile, color})} className={`w-12 h-12 rounded-full ${color} transition-all ${userProfile.color === color ? 'ring-4 ring-indigo-100 scale-110 shadow-lg' : 'opacity-40 hover:opacity-100'}`} />
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={saveProfile} disabled={isSaving} className="w-full bg-indigo-600 text-white py-6 rounded-[2.5rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl hover:bg-indigo-700 transition-all disabled:opacity-50">
                {isSaving ? 'Updating...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {view === 'support' && (
          <div className="flex-1 max-w-4xl mx-auto w-full py-24 px-6 text-center">
            <div className="text-6xl mb-8">💎</div>
            <h2 className="text-5xl font-black italic tracking-tighter mb-6 uppercase">Support the <span className="text-indigo-600">Creator</span></h2>
            <a href="https://www.patreon.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-4 bg-[#FF424D] text-white px-12 py-6 rounded-[2.5rem] font-black text-lg uppercase tracking-widest shadow-2xl hover:scale-105 transition-all">Join on Patreon</a>
          </div>
        )}

        {view === 'about' && (
          <div className="flex-1 max-w-4xl mx-auto w-full py-24 px-6">
            <h2 className="text-6xl font-black italic tracking-tighter mb-12 uppercase text-center">Our <span className="text-indigo-600">Story</span></h2>
            <div className="prose prose-slate max-w-none text-slate-600 font-medium text-lg leading-relaxed space-y-8 text-center">
              <p>The Hub was conceived as a digital sanctuary where the nuance of language and the power of storytelling take center stage.</p>
            </div>
          </div>
        )}

        {!['home', 'support', 'about', 'profile'].includes(view) && (
          <div className="max-w-7xl mx-auto w-full p-4 md:p-8 flex flex-col md:flex-row gap-8 flex-1">
            <aside className="w-full md:w-72 shrink-0">
              <div className="bg-white border rounded-[3.5rem] p-8 shadow-sm md:sticky md:top-28">
                <h3 className="text-[10px] font-black uppercase text-slate-400 mb-8 tracking-[0.3em] px-4">Selection</h3>
                <div className="flex flex-row md:flex-col overflow-x-auto no-scrollbar gap-3">
                  {(view === 'languages' ? LANGUAGES : GENRES).map(item => (
                    <button key={item.id} onClick={() => view === 'languages' ? setSelectedLang(item.id) : setGenre(item.id)} className={`px-6 py-5 rounded-[2rem] font-black text-[11px] uppercase flex items-center gap-5 transition-all shrink-0 md:shrink border-2 ${ (view === 'languages' ? selectedLang : genre) === item.id ? 'bg-indigo-600 text-white shadow-xl border-indigo-600' : 'hover:bg-slate-50 text-slate-500 border-transparent'}`}>
                      <span className="text-2xl">{item.icon}</span>
                      <span className="tracking-tight">{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <div className="flex-1 flex flex-col bg-white rounded-[4.5rem] border border-slate-100 shadow-2xl overflow-hidden min-h-[600px]">
              
              {/* WRITERS SUB-NAV RESTORED */}
              {view === 'writers' && (
                <div className="bg-slate-900 text-white p-5 flex flex-wrap items-center justify-center gap-12 px-10 shrink-0 shadow-xl relative z-10">
                  <button className="text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:text-white transition-colors flex items-center gap-2"><span>✍️</span> Give Advice?</button>
                  <button className="text-[10px] font-black uppercase tracking-widest hover:text-indigo-400 transition-colors flex items-center gap-2"><span>📄</span> Articles Feed</button>
                  <button className="text-[10px] font-black uppercase tracking-widest text-rose-400 hover:text-white transition-colors italic flex items-center gap-2"><span>🔎</span> Proofreading</button>
                </div>
              )}

              <header className="p-10 border-b flex items-center justify-between">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 bg-slate-50 rounded-[1.5rem] flex items-center justify-center text-3xl shadow-inner border border-slate-100">
                    {(view === 'languages' ? LANGUAGES.find(l=>l.id===selectedLang) : GENRES.find(g=>g.id===genre))?.icon}
                  </div>
                  <h2 className="font-black text-xl uppercase tracking-tighter text-slate-900 leading-tight">
                    {view === 'languages' ? selectedLang : genre} Lounge
                  </h2>
                </div>
              </header>

              <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-8 no-scrollbar bg-slate-50/20">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-300 font-black text-xs uppercase tracking-widest">Start the conversation...</div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={`max-w-[85%] flex flex-col ${m.userId === user?.uid ? 'items-end self-end' : 'items-start self-start'}`}>
                      <span className="text-[10px] font-black uppercase text-slate-400 mb-2 px-3">{m.userName || 'Anonymous'}</span>
                      <div className={`p-6 rounded-[2.5rem] text-[15px] font-medium leading-relaxed shadow-sm ${m.userId === user?.uid ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'}`}>
                        {m.text}
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-4 md:p-10 border-t bg-white shrink-0">
                <form onSubmit={handlePost} className="flex flex-row gap-2 max-w-5xl mx-auto w-full">
                  <input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Share thoughts..." className="flex-1 min-w-0 bg-slate-50 rounded-[2.5rem] px-6 py-4 outline-none font-bold text-sm border-2 border-transparent focus:border-indigo-100 transition-all" />
                  <button type="submit" className="bg-slate-900 text-white px-6 py-4 rounded-[2.5rem] font-black text-[10px] uppercase tracking-widest shadow-2xl active:scale-95 hover:bg-indigo-600 transition-all shrink-0">
                    Send 🚀
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-slate-950 text-white py-32 px-10 border-t border-slate-900 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start gap-20">
          <div className="space-y-8">
            <div className="text-5xl font-black italic tracking-tighter">HUB<span className="text-indigo-600">.</span></div>
            <p className="text-slate-500 max-w-xs font-medium leading-relaxed">Redefining digital community through the lens of literature and language.</p>
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-600">© 2026 THE HUB COMMUNITY.</p>
        </div>
      </footer>
      <style dangerouslySetInnerHTML={{ __html: `.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}} />
    </div>
  );
}
