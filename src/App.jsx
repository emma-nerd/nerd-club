import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  EmailAuthProvider,
  signOut,
  sendEmailVerification
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  arrayUnion
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAiLHAahWkJJ5aXMEBJmRPv1UN3jwvL5Qg",
  authDomain: "nerdclub-c5eaf.firebaseapp.com",
  projectId: "nerdclub-c5eaf",
  storageBucket: "nerdclub-c5eaf.firebasestorage.app",
  messagingSenderId: "323147983197",
  appId: "1:323147983197:web:7f1e61a48a11fde18da0b4",
  measurementId: "G-DVJD1EX7HW"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'the-hub-community';
const googleProvider = new GoogleAuthProvider();
const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;

const GENRES = [
  { id: 'fantasy', name: 'Fantasy', icon: '⚔️' },
  { id: 'scifi', name: 'Sci-Fi', icon: '🚀' },
  { id: 'mystery', name: 'Mystery', icon: '🕵️' },
  { id: 'romance', name: 'Romance', icon: '💖' },
  { id: 'nonfiction', name: 'Non-Fiction', icon: '🧠' }
];

const ADVICE_CATEGORIES = [
  { id: 'general', name: 'General Writing Advice' },
  { id: 'fantasy', name: 'Fantasy' },
  { id: 'scifi', name: 'Sci-Fi' },
  { id: 'mystery', name: 'Mystery' },
  { id: 'romance', name: 'Romance' },
  { id: 'nonfiction', name: 'Non-Fiction' }
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

const todayStr = () => new Date().toISOString().slice(0, 10);

const getHubKey = (view, genre, selectedLang) => {
  if (view === 'books') return `books_${genre}`;
  if (view === 'writers') return `writers_${genre}`;
  if (view === 'languages') return `langs_${selectedLang}`;
  return null;
};

const trackActivity = async (userId, hubKey) => {
  if (!userId || !hubKey) return;
  const activityRef = doc(db, 'artifacts', appId, 'users', userId, 'activity', hubKey);
  const snap = await getDoc(activityRef);
  const today = todayStr();
  if (snap.exists()) {
    const days = snap.data().days || [];
    if (!days.includes(today)) {
      await updateDoc(activityRef, { days: arrayUnion(today) });
    }
  } else {
    await setDoc(activityRef, { days: [today] });
  }
};

const checkCanMessage = async (myUid, theirUid) => {
  const hubs = [
    ...GENRES.map(g => `books_${g.id}`),
    ...GENRES.map(g => `writers_${g.id}`),
    ...LANGUAGES.map(l => `langs_${l.id}`)
  ];
  for (const hub of hubs) {
    const myRef = doc(db, 'artifacts', appId, 'users', myUid, 'activity', hub);
    const theirRef = doc(db, 'artifacts', appId, 'users', theirUid, 'activity', hub);
    const [mySnap, theirSnap] = await Promise.all([getDoc(myRef), getDoc(theirRef)]);
    if (mySnap.exists() && theirSnap.exists()) {
      const myDays = new Set(mySnap.data().days || []);
      const theirDays = new Set(theirSnap.data().days || []);
      const shared = [...myDays].filter(d => theirDays.has(d));
      if (shared.length >= 5) return true;
    }
  }
  return false;
};

const getOrCreateDM = async (myUid, theirUid) => {
  const ids = [myUid, theirUid].sort();
  const dmId = ids.join('_');
  const dmRef = doc(db, 'artifacts', appId, 'dms', dmId);
  const snap = await getDoc(dmRef);
  if (!snap.exists()) {
    await setDoc(dmRef, {
      participants: ids,
      createdAt: serverTimestamp(),
      type: 'dm'
    });
  }
  return dmId;
};

function AuthModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async () => {
    setError('');
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      const credential = EmailAuthProvider.credential(email, password);
      if (mode === 'signup') {
        let userCredential;
        if (currentUser?.isAnonymous) {
          userCredential = await linkWithCredential(currentUser, credential);
        } else {
          userCredential = await createUserWithEmailAndPassword(auth, email, password);
        }
        await sendEmailVerification(userCredential.user);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onSuccess();
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') setError('Email already in use.');
      else if (err.code === 'auth/invalid-email') setError('Invalid email address.');
      else if (err.code === 'auth/weak-password') setError('Password must be at least 6 characters.');
      else if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') setError('Incorrect email or password.');
      else setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (currentUser?.isAnonymous) {
        await linkWithPopup(currentUser, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
      onSuccess();
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') setError('');
      else setError('Google sign-in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 z-[2000] flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-[3rem] p-10 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">
            {mode === 'login' ? 'Welcome Back' : 'Join the'} <span className="text-indigo-600">{mode === 'login' ? '👋' : 'Hub.'}</span>
          </h2>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 text-xl">✕</button>
        </div>
        {mode === 'signup' && (
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-4 py-3 rounded-2xl mb-6">
            A verification email will be sent after sign up. You'll need to verify your email to send private messages.
          </p>
        )}
        {error && <p className="text-rose-500 text-xs font-black uppercase tracking-widest mb-6 bg-rose-50 px-4 py-3 rounded-2xl">{error}</p>}
        <button onClick={handleGoogle} disabled={loading} className="w-full flex items-center justify-center gap-4 border-2 border-slate-100 py-4 rounded-[2rem] font-black text-xs uppercase tracking-widest mb-6 hover:bg-slate-50 transition-all disabled:opacity-50">
          <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-slate-100"></div>
          <span className="text-[10px] font-black uppercase text-slate-300 tracking-widest">or</span>
          <div className="flex-1 h-px bg-slate-100"></div>
        </div>
        <div className="space-y-4 mb-6">
          <input type="email" placeholder="Email address" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-50 rounded-[2rem] px-6 py-4 outline-none font-bold text-sm border-2 border-transparent focus:border-indigo-100 transition-all" />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleEmailAuth()} className="w-full bg-slate-50 rounded-[2rem] px-6 py-4 outline-none font-bold text-sm border-2 border-transparent focus:border-indigo-100 transition-all" />
        </div>
        <button onClick={handleEmailAuth} disabled={loading} className="w-full bg-indigo-600 text-white py-4 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all disabled:opacity-50 mb-6">
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
        <p className="text-center text-[11px] font-bold text-slate-400">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }} className="text-indigo-600 font-black uppercase tracking-widest">
            {mode === 'login' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>
    </div>
  );
}

function ProfilePopup({ profile, theirUid, myUid, isEmailVerified, isRegistered, onClose, onMessageClick }) {
  const [canMessage, setCanMessage] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!myUid || !theirUid || !isRegistered || !isEmailVerified) {
      setChecking(false);
      return;
    }
    checkCanMessage(myUid, theirUid).then(result => {
      setCanMessage(result);
      setChecking(false);
    });
  }, [myUid, theirUid, isRegistered, isEmailVerified]);

  const getMessageBlockedReason = () => {
    if (!isRegistered) return 'Sign up to send private messages';
    if (!isEmailVerified) return 'Verify your email to send private messages';
    if (!canMessage) return 'Chat together in the same hub for 5 days to unlock private messages';
    return null;
  };

  const blockedReason = getMessageBlockedReason();

  return (
    <div className="fixed inset-0 bg-slate-950/60 z-[3000] flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-[3rem] p-8 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex justify-end mb-4">
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500">✕</button>
        </div>
        <div className="flex flex-col items-center text-center gap-4">
          <div className={`w-20 h-20 rounded-full ${profile.color || 'bg-indigo-600'} flex items-center justify-center text-white text-3xl font-black shadow-xl`}>
            {(profile.displayName || 'U')[0]}
          </div>
          <div>
            <h3 className="font-black text-xl uppercase tracking-tighter">{profile.displayName}</h3>
            {profile.role && <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mt-1">{profile.role}</p>}
          </div>
          {profile.description && (
            <p className="text-slate-500 text-sm font-medium leading-relaxed bg-slate-50 rounded-2xl px-4 py-3 w-full text-left">
              {profile.description}
            </p>
          )}
          {myUid !== theirUid && (
            <div className="w-full mt-2">
              {checking ? (
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-300 py-3">Checking...</div>
              ) : blockedReason ? (
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 rounded-2xl px-4 py-3">{blockedReason}</div>
              ) : (
                <button onClick={() => { onMessageClick(theirUid, profile); onClose(); }} className="w-full bg-indigo-600 text-white py-4 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all">
                  💬 Send Private Message
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MessagesPage({ user, userProfile, isEmailVerified, onShowAuth }) {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [searchUid, setSearchUid] = useState('');
  const [groupMembers, setGroupMembers] = useState([]);
  const [creating, setCreating] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (!user || user.isAnonymous) return;
    const q = query(
      collection(db, 'artifacts', appId, 'dms'),
      where('participants', 'array-contains', user.uid)
    );
    const unsub = onSnapshot(q, async (snap) => {
      const convs = await Promise.all(snap.docs.map(async d => {
        const data = { id: d.id, ...d.data() };
        if (data.type === 'dm') {
          const otherId = data.participants.find(p => p !== user.uid);
          const profileRef = doc(db, 'artifacts', appId, 'users', otherId, 'settings', 'profile');
          const profileSnap = await getDoc(profileRef);
          data.otherProfile = profileSnap.exists() ? profileSnap.data() : { displayName: 'User' };
          data.otherUid = otherId;
        }
        return data;
      }));
      setConversations(convs);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!activeConv) return;
    const q = query(
      collection(db, 'artifacts', appId, 'dms', activeConv.id, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [activeConv]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeConv) return;
    await addDoc(collection(db, 'artifacts', appId, 'dms', activeConv.id, 'messages'), {
      text: newMessage,
      userId: user.uid,
      userName: userProfile.displayName || 'User',
      userColor: userProfile.color || 'bg-indigo-600',
      createdAt: serverTimestamp()
    });
    setNewMessage('');
  };

  const createGroup = async () => {
    if (!groupName.trim() || groupMembers.length < 1) return;
    setCreating(true);
    try {
      const allMembers = [user.uid, ...groupMembers.map(m => m.uid)];
      if (allMembers.length > 10) { alert('Maximum 10 members allowed.'); return; }
      await addDoc(collection(db, 'artifacts', appId, 'dms'), {
        participants: allMembers,
        groupName,
        type: 'group',
        createdBy: user.uid,
        createdAt: serverTimestamp()
      });
      setShowCreateGroup(false);
      setGroupName('');
      setGroupMembers([]);
    } catch (err) { console.error(err); }
    finally { setCreating(false); }
  };

  const addMemberByUid = async () => {
    if (!searchUid.trim()) return;
    if (groupMembers.find(m => m.uid === searchUid)) return;
    if (groupMembers.length >= 9) { alert('Maximum 9 additional members (10 total including you).'); return; }
    const profileRef = doc(db, 'artifacts', appId, 'users', searchUid, 'settings', 'profile');
    const snap = await getDoc(profileRef);
    if (snap.exists()) {
      setGroupMembers(prev => [...prev, { uid: searchUid, ...snap.data() }]);
      setSearchUid('');
    } else {
      alert('User not found. Make sure you have the correct user ID.');
    }
  };

  if (!user || user.isAnonymous) return (
    <div className="flex-1 flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="text-6xl mb-6">💬</div>
      <h2 className="text-4xl font-black italic tracking-tighter uppercase mb-4">Private <span className="text-indigo-600">Messages</span></h2>
      <p className="text-slate-400 font-medium mb-6">Sign up to send and receive private messages.</p>
      <button onClick={onShowAuth} className="bg-indigo-600 text-white px-8 py-4 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all">Sign Up</button>
    </div>
  );

  if (activeConv) return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full">
      <div className="p-6 border-b flex items-center gap-4 bg-white sticky top-20 z-10">
        <button onClick={() => { setActiveConv(null); setMessages([]); }} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors">← Back</button>
        <div className="flex items-center gap-3">
          {activeConv.type === 'dm' ? (
            <>
              <div className={`w-10 h-10 rounded-full ${activeConv.otherProfile?.color || 'bg-indigo-600'} flex items-center justify-center text-white font-black text-xs`}>
                {(activeConv.otherProfile?.displayName || 'U')[0]}
              </div>
              <span className="font-black text-sm uppercase tracking-tight">{activeConv.otherProfile?.displayName}</span>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-black text-xs">👥</div>
              <span className="font-black text-sm uppercase tracking-tight">{activeConv.groupName}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-6 no-scrollbar bg-slate-50/20">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-300 font-black text-xs uppercase tracking-widest">No messages yet. Say hello!</div>
        ) : (
          messages.map(m => (
            <div key={m.id} className={`max-w-[80%] flex flex-col ${m.userId === user.uid ? 'items-end self-end' : 'items-start self-start'}`}>
              <span className="text-[10px] font-black uppercase text-slate-400 mb-1 px-3">{m.userName}</span>
              <div className={`p-5 rounded-[2rem] text-sm font-medium leading-relaxed shadow-sm ${m.userId === user.uid ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'}`}>
                {m.text}
              </div>
            </div>
          ))
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-6 border-t bg-white">
        {!isEmailVerified && (
          <p className="text-center text-[10px] font-black uppercase tracking-widest text-rose-400 mb-3">Verify your email to send messages</p>
        )}
        <form onSubmit={sendMessage} className="flex gap-3">
          <input value={newMessage} onChange={e => setNewMessage(e.target.value)} disabled={!isEmailVerified} placeholder={isEmailVerified ? "Type a message..." : "Email verification required"} className="flex-1 bg-slate-50 rounded-[2rem] px-6 py-4 outline-none font-bold text-sm border-2 border-transparent focus:border-indigo-100 transition-all disabled:opacity-50" />
          <button type="submit" disabled={!isEmailVerified} className="bg-slate-900 text-white px-6 py-4 rounded-[2rem] font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 hover:bg-indigo-600 transition-all disabled:opacity-50">Send</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex-1 max-w-3xl mx-auto w-full py-12 px-6">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h2 className="text-4xl font-black italic tracking-tighter uppercase mb-1">Private <span className="text-indigo-600">Messages</span></h2>
          {!isEmailVerified && (
            <p className="text-[10px] font-black uppercase tracking-widest text-rose-400">⚠️ Verify your email to unlock messaging</p>
          )}
        </div>
        <button onClick={() => setShowCreateGroup(true)} className="bg-indigo-600 text-white px-5 py-3 rounded-[2rem] font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all">
          + Create Group
        </button>
      </div>

      {showCreateGroup && (
        <div className="bg-white rounded-[3rem] border border-slate-100 shadow-2xl p-8 mb-8">
          <h3 className="font-black text-lg uppercase tracking-tighter mb-6">Create Group Chat</h3>
          <div className="space-y-4">
            <input value={groupName} onChange={e => setGroupName(e.target.value)} placeholder="Group name" className="w-full bg-slate-50 rounded-[2rem] px-6 py-4 outline-none font-bold text-sm border-2 border-transparent focus:border-indigo-100 transition-all" />
            <div className="flex gap-3">
              <input value={searchUid} onChange={e => setSearchUid(e.target.value)} placeholder="Paste a user's ID to add them" className="flex-1 bg-slate-50 rounded-[2rem] px-6 py-4 outline-none font-bold text-sm border-2 border-transparent focus:border-indigo-100 transition-all" />
              <button onClick={addMemberByUid} className="bg-slate-900 text-white px-5 py-4 rounded-[2rem] font-black text-[10px] uppercase tracking-widest hover:bg-indigo-600 transition-all">Add</button>
            </div>
            {groupMembers.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {groupMembers.map(m => (
                  <div key={m.uid} className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-full">
                    <span className="font-black text-xs uppercase">{m.displayName}</span>
                    <button onClick={() => setGroupMembers(prev => prev.filter(x => x.uid !== m.uid))} className="text-indigo-300 hover:text-rose-500">✕</button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-300">Your user ID: {user.uid}</p>
            <div className="flex gap-3">
              <button onClick={createGroup} disabled={creating || !groupName.trim() || groupMembers.length < 1} className="flex-1 bg-indigo-600 text-white py-4 rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all disabled:opacity-50">
                {creating ? 'Creating...' : 'Create Group'}
              </button>
              <button onClick={() => setShowCreateGroup(false)} className="px-6 py-4 border-2 border-slate-100 text-slate-400 rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {conversations.length === 0 ? (
        <div className="text-center py-24 text-slate-300 font-black text-xs uppercase tracking-widest">No conversations yet. Start chatting in the hubs to unlock private messages!</div>
      ) : (
        <div className="space-y-4">
          {conversations.map(conv => (
            <button key={conv.id} onClick={() => setActiveConv(conv)} className="w-full flex items-center gap-4 p-6 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all text-left">
              <div className={`w-12 h-12 rounded-full ${conv.type === 'dm' ? (conv.otherProfile?.color || 'bg-indigo-600') : 'bg-indigo-600'} flex items-center justify-center text-white font-black text-sm shrink-0`}>
                {conv.type === 'dm' ? (conv.otherProfile?.displayName || 'U')[0] : '👥'}
              </div>
              <div>
                <p className="font-black text-sm uppercase tracking-tight">{conv.type === 'dm' ? conv.otherProfile?.displayName : conv.groupName}</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 mt-1">{conv.type === 'group' ? 'Group Chat' : 'Private Message'}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function GiveAdvicePage({ user, isRegistered, onShowAuth }) {
  const [form, setForm] = useState({ name: '', email: '', categories: [], header: '', body: '' });
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const toggleCategory = (id) => {
    setForm(f => ({
      ...f,
      categories: f.categories.includes(id) ? f.categories.filter(c => c !== id) : [...f.categories, id]
    }));
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setFileContent(ev.target.result);
    reader.readAsText(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isRegistered) { onShowAuth(); return; }
    if (!form.name || !form.email || !form.header || (!form.body && !fileContent)) { setError('Please fill in all required fields.'); return; }
    if (form.categories.length === 0) { setError('Please select at least one category.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'submissions'), {
        name: form.name, email: form.email, categories: form.categories,
        header: form.header, body: form.body || fileContent,
        fileName: fileName || '', status: 'pending',
        submittedBy: user.uid, createdAt: serverTimestamp()
      });
      setSubmitted(true);
    } catch (err) { setError('Something went wrong. Please try again.'); }
    finally { setSubmitting(false); }
  };

  if (submitted) return (
    <div className="flex-1 flex flex-col items-center justify-center py-24 px-6 text-center">
      <div className="text-6xl mb-6">🎉</div>
      <h2 className="text-4xl font-black italic tracking-tighter uppercase mb-4">Article <span className="text-indigo-600">Submitted!</span></h2>
      <p className="text-slate-400 font-medium max-w-md">Your article is under review. Once approved it will appear in the Articles Feed. Thank you for contributing!</p>
    </div>
  );

  return (
    <div className="flex-1 max-w-3xl mx-auto w-full py-16 px-6">
      <div className="mb-12 text-center">
        <div className="inline-block px-4 py-1.5 bg-indigo-50 rounded-full text-indigo-600 font-black text-[10px] uppercase tracking-[0.3em] mb-4">Writers Hub</div>
        <h2 className="text-5xl font-black italic tracking-tighter uppercase mb-4">Give <span className="text-indigo-600">Advice</span></h2>
        <p className="text-slate-400 font-medium">Share your writing wisdom with the community.</p>
        {!isRegistered && <p className="mt-4 text-[11px] font-black uppercase tracking-widest text-rose-400">You must be signed in to submit an article.</p>}
      </div>
      <div className="bg-white rounded-[4rem] shadow-2xl border border-slate-100 p-8 md:p-12 space-y-8">
        {error && <p className="text-rose-500 text-xs font-black uppercase tracking-widest bg-rose-50 px-4 py-3 rounded-2xl">{error}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-3">Your Name *</label>
            <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full bg-slate-50 rounded-[2rem] px-6 py-4 outline-none font-bold text-sm border-2 border-transparent focus:border-indigo-100 transition-all" placeholder="Full name" />
          </div>
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-3">Email Address *</label>
            <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full bg-slate-50 rounded-[2rem] px-6 py-4 outline-none font-bold text-sm border-2 border-transparent focus:border-indigo-100 transition-all" placeholder="your@email.com" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-3">Categories * <span className="text-slate-300">(select all that apply)</span></label>
          <div className="flex flex-wrap gap-3">
            {ADVICE_CATEGORIES.map(cat => (
              <button key={cat.id} type="button" onClick={() => toggleCategory(cat.id)} className={`px-5 py-2.5 rounded-[2rem] font-black text-[11px] uppercase transition-all border-2 ${form.categories.includes(cat.id) ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-3">Article Title *</label>
          <input type="text" value={form.header} onChange={e => setForm({...form, header: e.target.value})} className="w-full bg-slate-50 rounded-[2rem] px-6 py-4 outline-none font-bold text-sm border-2 border-transparent focus:border-indigo-100 transition-all" placeholder="Enter your article title" />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-3">Article Content *</label>
          <textarea value={form.body} onChange={e => setForm({...form, body: e.target.value})} rows={10} className="w-full bg-slate-50 rounded-[2rem] px-6 py-4 outline-none font-medium text-sm border-2 border-transparent focus:border-indigo-100 transition-all resize-none leading-relaxed" placeholder="Paste your article here..." />
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-3">Or Upload a File <span className="text-slate-300">(PDF or DOCX)</span></label>
          <label className="flex items-center gap-4 bg-slate-50 rounded-[2rem] px-6 py-4 cursor-pointer border-2 border-dashed border-slate-200 hover:border-indigo-200 transition-all">
            <span className="text-2xl">📎</span>
            <span className="font-bold text-sm text-slate-400">{fileName || 'Click to upload a file...'}</span>
            <input type="file" accept=".pdf,.docx,.txt" onChange={handleFile} className="hidden" />
          </label>
        </div>
        <button onClick={handleSubmit} disabled={submitting} className="w-full bg-indigo-600 text-white py-6 rounded-[2.5rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl hover:bg-indigo-700 transition-all disabled:opacity-50">
          {submitting ? 'Submitting...' : isRegistered ? 'Submit Article ✍️' : 'Sign In to Submit'}
        </button>
      </div>
    </div>
  );
}

function ArticlesFeedPage() {
  const [articles, setArticles] = useState([]);
  const [selectedFilters, setSelectedFilters] = useState([]);
  const [expandedArticle, setExpandedArticle] = useState(null);

  useEffect(() => {
    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'submissions'),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, s => {
      setArticles(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const toggleFilter = (id) => setSelectedFilters(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  const filtered = selectedFilters.length === 0 ? articles : articles.filter(a => a.categories?.some(c => selectedFilters.includes(c)));

  if (expandedArticle) return (
    <div className="flex-1 max-w-3xl mx-auto w-full py-16 px-6">
      <button onClick={() => setExpandedArticle(null)} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors mb-10">← Back to Articles</button>
      <div className="bg-white rounded-[4rem] shadow-2xl border border-slate-100 p-8 md:p-16">
        <div className="flex flex-wrap gap-2 mb-6">
          {expandedArticle.categories?.map(c => (
            <span key={c} className="px-4 py-1.5 bg-indigo-50 text-indigo-600 rounded-full font-black text-[10px] uppercase tracking-widest">
              {ADVICE_CATEGORIES.find(x => x.id === c)?.name || c}
            </span>
          ))}
        </div>
        <h1 className="text-4xl font-black italic tracking-tighter uppercase mb-4">{expandedArticle.header}</h1>
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-10">By {expandedArticle.name}</p>
        <div className="text-slate-600 font-medium leading-relaxed text-lg whitespace-pre-wrap">{expandedArticle.body}</div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 max-w-5xl mx-auto w-full py-16 px-6">
      <div className="mb-12 text-center">
        <div className="inline-block px-4 py-1.5 bg-indigo-50 rounded-full text-indigo-600 font-black text-[10px] uppercase tracking-[0.3em] mb-4">Writers Hub</div>
        <h2 className="text-5xl font-black italic tracking-tighter uppercase mb-4">Articles <span className="text-indigo-600">Feed</span></h2>
        <p className="text-slate-400 font-medium">Writing advice from the community.</p>
      </div>
      <div className="mb-10">
        <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-4">Filter by category</p>
        <div className="flex flex-wrap gap-3">
          {ADVICE_CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => toggleFilter(cat.id)} className={`px-5 py-2.5 rounded-[2rem] font-black text-[11px] uppercase transition-all border-2 ${selectedFilters.includes(cat.id) ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
              {cat.name}
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-24 text-slate-300 font-black text-xs uppercase tracking-widest">No articles yet. Be the first to contribute!</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map(article => (
            <div key={article.id} onClick={() => setExpandedArticle(article)} className="bg-white rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all cursor-pointer p-8">
              <div className="flex flex-wrap gap-2 mb-4">
                {article.categories?.map(c => (
                  <span key={c} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full font-black text-[9px] uppercase tracking-widest">
                    {ADVICE_CATEGORIES.find(x => x.id === c)?.name || c}
                  </span>
                ))}
              </div>
              <h3 className="font-black text-lg uppercase tracking-tighter mb-3 leading-tight">{article.header}</h3>
              <p className="text-slate-400 text-sm font-medium leading-relaxed line-clamp-3">{article.body?.slice(0, 150)}...</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-300 mt-4">By {article.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminPage({ user, isAdmin }) {
  const [submissions, setSubmissions] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'submissions'),
      where('status', '==', filter),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, s => {
      setSubmissions(s.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [isAdmin, filter]);

  const updateStatus = async (id, status) => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'submissions', id), { status });
  };

  if (!isAdmin) return (
    <div className="flex-1 flex items-center justify-center py-24 px-6 text-center">
      <div>
        <div className="text-6xl mb-6">🔒</div>
        <h2 className="text-4xl font-black italic tracking-tighter uppercase mb-4">Access <span className="text-rose-500">Denied</span></h2>
        <p className="text-slate-400 font-medium">You don't have permission to view this page.</p>
      </div>
    </div>
  );

  return (
    <div className="flex-1 max-w-4xl mx-auto w-full py-16 px-6">
      <div className="mb-12">
        <div className="inline-block px-4 py-1.5 bg-rose-50 rounded-full text-rose-500 font-black text-[10px] uppercase tracking-[0.3em] mb-4">Admin Only</div>
        <h2 className="text-5xl font-black italic tracking-tighter uppercase mb-4">Article <span className="text-indigo-600">Review</span></h2>
        <p className="text-slate-400 font-medium">Review and approve submitted articles.</p>
      </div>
      <div className="flex gap-3 mb-10">
        {['pending', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)} className={`px-6 py-3 rounded-[2rem] font-black text-[11px] uppercase transition-all border-2 ${filter === s ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
            {s}
          </button>
        ))}
      </div>
      {submissions.length === 0 ? (
        <div className="text-center py-24 text-slate-300 font-black text-xs uppercase tracking-widest">No {filter} submissions.</div>
      ) : (
        <div className="space-y-6">
          {submissions.map(sub => (
            <div key={sub.id} className="bg-white rounded-[3rem] border border-slate-100 shadow-sm p-8">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-black text-lg uppercase tracking-tighter mb-1">{sub.header}</h3>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">By {sub.name} · {sub.email}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {sub.categories?.map(c => (
                      <span key={c} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full font-black text-[9px] uppercase tracking-widest">
                        {ADVICE_CATEGORIES.find(x => x.id === c)?.name || c}
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={() => setExpandedId(expandedId === sub.id ? null : sub.id)} className="text-[10px] font-black uppercase tracking-widest text-indigo-600 shrink-0">
                  {expandedId === sub.id ? 'Hide ▲' : 'Read ▼'}
                </button>
              </div>
              {expandedId === sub.id && (
                <div className="bg-slate-50 rounded-[2rem] p-6 mb-6 text-sm text-slate-600 font-medium leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {sub.body}
                </div>
              )}
              {filter === 'pending' && (
                <div className="flex gap-3">
                  <button onClick={() => updateStatus(sub.id, 'approved')} className="flex-1 bg-emerald-500 text-white py-3 rounded-[2rem] font-black text-[11px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg">✅ Approve</button>
                  <button onClick={() => updateStatus(sub.id, 'rejected')} className="flex-1 bg-rose-500 text-white py-3 rounded-[2rem] font-black text-[11px] uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg">❌ Reject</button>
                </div>
              )}
              {filter === 'approved' && (
                <button onClick={() => updateStatus(sub.id, 'rejected')} className="w-full border-2 border-rose-200 text-rose-400 py-3 rounded-[2rem] font-black text-[11px] uppercase tracking-widest hover:bg-rose-50 transition-all">Revoke Approval</button>
              )}
              {filter === 'rejected' && (
                <button onClick={() => updateStatus(sub.id, 'approved')} className="w-full border-2 border-emerald-200 text-emerald-500 py-3 rounded-[2rem] font-black text-[11px] uppercase tracking-widest hover:bg-emerald-50 transition-all">Approve After All</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('home');
  const [genre, setGenre] = useState('fantasy');
  const [selectedLang, setSelectedLang] = useState('chinese');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDMOpen, setIsDMOpen] = useState(false);
  const [userProfile, setUserProfile] = useState({ displayName: 'Guest', color: 'bg-indigo-600', role: 'Reader', description: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [profilePopup, setProfilePopup] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    const initAuth = async () => {
      try { await signInAnonymously(auth); }
      catch (err) { console.error("Auth error:", err); }
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
          const initialProfile = { displayName: 'User_' + u.uid.slice(0, 4), color: 'bg-indigo-600', role: 'Reader', description: '' };
          await setDoc(profileRef, initialProfile);
          setUserProfile(initialProfile);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const hubViews = ['books', 'writers', 'languages'];
    if (!hubViews.includes(view)) return;
    const pathSegment = getHubKey(view, genre, selectedLang);
    if (!pathSegment) return;

    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', pathSegment),
      orderBy('createdAt', 'asc'),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, s => {
      setMessages(s.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.warn("Firestore error:", err));
    return () => unsubscribe();
  }, [user, view, genre, selectedLang]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handlePost = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;
    if (user.isAnonymous) { setShowAuthModal(true); return; }
    const pathSegment = getHubKey(view, genre, selectedLang);
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', pathSegment), {
        text: newMessage,
        userId: user.uid,
        userName: userProfile.displayName || 'Guest',
        userColor: userProfile.color || 'bg-indigo-600',
        createdAt: serverTimestamp()
      });
      await trackActivity(user.uid, pathSegment);
      setNewMessage('');
    } catch (err) { console.error("Post error:", err); }
  };

  const saveProfile = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'profile'), userProfile);
      setView('home');
    } catch (err) { console.error(err); }
    finally { setIsSaving(false); }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    await signInAnonymously(auth);
    navigateTo('home');
  };

  const navigateTo = (v) => {
    setView(v);
    setIsMenuOpen(false);
    setIsDMOpen(false);
    window.scrollTo(0, 0);
  };

  const handleAvatarClick = async (msg) => {
    if (msg.userId === user?.uid) return;
    const profileRef = doc(db, 'artifacts', appId, 'users', msg.userId, 'settings', 'profile');
    const snap = await getDoc(profileRef);
    const profile = snap.exists() ? snap.data() : { displayName: msg.userName, color: msg.userColor };
    setProfilePopup({ profile, theirUid: msg.userId });
  };

  const handleMessageClick = async (theirUid, theirProfile) => {
    if (!user) return;
    await getOrCreateDM(user.uid, theirUid);
    navigateTo('messages');
  };

  const isRegistered = user && !user.isAnonymous;
  const isEmailVerified = user?.emailVerified || false;
  const isAdmin = !!ADMIN_EMAIL && user?.email === ADMIN_EMAIL;

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col relative overflow-x-hidden">
      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} onSuccess={() => setShowAuthModal(false)} />
      )}

      {profilePopup && (
        <ProfilePopup
          profile={profilePopup.profile}
          theirUid={profilePopup.theirUid}
          myUid={user?.uid}
          isEmailVerified={isEmailVerified}
          isRegistered={isRegistered}
          onClose={() => setProfilePopup(null)}
          onMessageClick={handleMessageClick}
        />
      )}

      <header className="h-20 bg-white border-b border-slate-100 px-6 md:px-12 flex items-center justify-between sticky top-0 z-[500] backdrop-blur-md bg-white/90">
        <div className="flex items-center gap-6">
          <button onClick={() => setIsMenuOpen(true)} className="p-3 hover:bg-slate-50 rounded-2xl transition-all active:scale-90">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h8m-8 6h16" /></svg>
          </button>
          <div className="text-2xl font-black italic tracking-tighter cursor-pointer select-none" onClick={() => navigateTo('home')}>HUB.</div>
        </div>
        <div className="flex items-center gap-4">
          {!isRegistered && (
            <button onClick={() => setShowAuthModal(true)} className="px-4 py-1.5 bg-indigo-600 text-white rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg whitespace-nowrap">Sign Up</button>
          )}
          <button onClick={() => navigateTo('messages')} className="p-3 text-slate-400 hover:text-indigo-600 relative transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
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
          {isRegistered && (
            <button onClick={() => navigateTo('messages')} className={`w-full text-left p-4 rounded-2xl font-black text-[12px] uppercase flex items-center gap-4 transition-all ${view === 'messages' ? 'bg-indigo-600 text-white shadow-xl' : 'hover:bg-slate-50 text-slate-500'}`}>
              <span className="text-xl">💬</span>
              <span>Private Messages</span>
            </button>
          )}
          {isAdmin && (
            <button onClick={() => navigateTo('admin')} className={`w-full text-left p-4 rounded-2xl font-black text-[12px] uppercase flex items-center gap-4 transition-all ${view === 'admin' ? 'bg-rose-500 text-white shadow-xl' : 'hover:bg-rose-50 text-rose-400'}`}>
              <span className="text-xl">🔒</span>
              <span>Admin</span>
            </button>
          )}
        </nav>
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
                  {isRegistered && <p className="text-xs text-slate-400 font-bold">{user.email}</p>}
                  {isRegistered && !isEmailVerified && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-400 mt-1">⚠️ Email not verified — check your inbox</p>
                  )}
                  {!isRegistered && (
                    <button onClick={() => setShowAuthModal(true)} className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:underline">Create an account →</button>
                  )}
                </div>
              </div>
              <div className="space-y-8">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-4">Display Name</label>
                  <input type="text" value={userProfile.displayName || ''} onChange={e => setUserProfile({...userProfile, displayName: e.target.value})} className="w-full bg-slate-50 rounded-3xl px-8 py-6 outline-none font-bold text-lg border-2 border-transparent focus:border-indigo-100 transition-all shadow-inner" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-4">About Me</label>
                  <textarea value={userProfile.description || ''} onChange={e => setUserProfile({...userProfile, description: e.target.value})} rows={4} placeholder="Tell the community a little about yourself..." className="w-full bg-slate-50 rounded-3xl px-8 py-6 outline-none font-medium text-sm border-2 border-transparent focus:border-indigo-100 transition-all shadow-inner resize-none leading-relaxed" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-4">Avatar Theme</label>
                  <div className="flex flex-wrap gap-4">
                    {PROFILE_COLORS.map(color => (
                      <button key={color} onClick={() => setUserProfile({...userProfile, color})} className={`w-12 h-12 rounded-full ${color} transition-all ${userProfile.color === color ? 'ring-4 ring-indigo-100 scale-110 shadow-lg' : 'opacity-40 hover:opacity-100'}`} />
                    ))}
                  </div>
                </div>
                {isRegistered && (
                  <div className="bg-slate-50 rounded-3xl px-8 py-4">
                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-1">Your User ID</p>
                    <p className="font-mono text-xs text-slate-500 break-all">{user.uid}</p>
                    <p className="text-[9px] font-black uppercase text-slate-300 tracking-widest mt-1">Share this with friends to add you to group chats</p>
                  </div>
                )}
              </div>
              <button onClick={saveProfile} disabled={isSaving} className="w-full bg-indigo-600 text-white py-6 rounded-[2.5rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl hover:bg-indigo-700 transition-all disabled:opacity-50">
                {isSaving ? 'Updating...' : 'Save Changes'}
              </button>
              {isRegistered && (
                <button onClick={handleSignOut} className="w-full border-2 border-slate-100 text-slate-400 py-4 rounded-[2.5rem] font-black text-xs uppercase tracking-widest hover:border-rose-200 hover:text-rose-400 transition-all">
                  Sign Out
                </button>
              )}
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

        {view === 'give-advice' && (
          <GiveAdvicePage user={user} isRegistered={isRegistered} onShowAuth={() => setShowAuthModal(true)} />
        )}

        {view === 'articles-feed' && <ArticlesFeedPage />}
        {view === 'admin' && <AdminPage user={user} isAdmin={isAdmin} />}
        {view === 'messages' && (
          <MessagesPage user={user} userProfile={userProfile} isEmailVerified={isEmailVerified} onShowAuth={() => setShowAuthModal(true)} />
        )}

        {!['home', 'support', 'about', 'profile', 'give-advice', 'articles-feed', 'admin', 'messages'].includes(view) && (
          <div className="max-w-7xl mx-auto w-full p-4 md:p-8 flex flex-col md:flex-row gap-8 flex-1">
            <aside className="w-full md:w-72 shrink-0">
              <div className="bg-white border rounded-[3.5rem] p-8 shadow-sm md:sticky md:top-28">
                <h3 className="text-[10px] font-black uppercase text-slate-400 mb-8 tracking-[0.3em] px-4">Selection</h3>
                <div className="flex flex-row md:flex-col overflow-x-auto no-scrollbar gap-3">
                  {(view === 'languages' ? LANGUAGES : GENRES).map(item => (
                    <button key={item.id} onClick={() => view === 'languages' ? setSelectedLang(item.id) : setGenre(item.id)} className={`px-6 py-5 rounded-[2rem] font-black text-[11px] uppercase flex items-center gap-5 transition-all shrink-0 md:shrink border-2 ${(view === 'languages' ? selectedLang : genre) === item.id ? 'bg-indigo-600 text-white shadow-xl border-indigo-600' : 'hover:bg-slate-50 text-slate-500 border-transparent'}`}>
                      <span className="text-2xl">{item.icon}</span>
                      <span className="tracking-tight">{item.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            <div className="flex-1 flex flex-col bg-white rounded-[4.5rem] border border-slate-100 shadow-2xl overflow-hidden min-h-[600px]">
              {view === 'writers' && (
                <div className="bg-slate-900 text-white p-5 flex flex-wrap items-center justify-center gap-12 px-10 shrink-0 shadow-xl relative z-10">
                  <button onClick={() => navigateTo('give-advice')} className="text-[10px] font-black uppercase tracking-widest text-indigo-400 hover:text-white transition-colors flex items-center gap-2"><span>✍️</span> Give Advice?</button>
                  <button onClick={() => navigateTo('articles-feed')} className="text-[10px] font-black uppercase tracking-widest hover:text-indigo-400 transition-colors flex items-center gap-2"><span>📄</span> Articles Feed</button>
                  <button className="text-[10px] font-black uppercase tracking-widest text-rose-400 hover:text-white transition-colors italic flex items-center gap-2"><span>🔎</span> Proofreading</button>
                </div>
              )}

              <header className="p-10 border-b flex items-center justify-between">
                <div className="flex items-center gap-5">
                  <div className="w-16 h-16 bg-slate-50 rounded-[1.5rem] flex items-center justify-center text-3xl shadow-inner border border-slate-100">
                    {(view === 'languages' ? LANGUAGES.find(l => l.id === selectedLang) : GENRES.find(g => g.id === genre))?.icon}
                  </div>
                  <h2 className="font-black text-xl uppercase tracking-tighter text-slate-900 leading-tight">
                    {view === 'languages' ? selectedLang : genre} Lounge
                  </h2>
                </div>
                {isRegistered && (
                  <button onClick={() => navigateTo('messages')} className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:underline flex items-center gap-2">
                    💬 Messages
                  </button>
                )}
              </header>

              <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-8 no-scrollbar bg-slate-50/20">
                {messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-300 font-black text-xs uppercase tracking-widest">Start the conversation...</div>
                ) : (
                  messages.map(m => (
                    <div key={m.id} className={`max-w-[85%] flex flex-col ${m.userId === user?.uid ? 'items-end self-end' : 'items-start self-start'}`}>
                      <div className={`flex items-center gap-2 mb-2 ${m.userId === user?.uid ? 'flex-row-reverse' : 'flex-row'}`}>
                        <button onClick={() => handleAvatarClick(m)} className={`w-8 h-8 rounded-full ${m.userColor || 'bg-indigo-600'} flex items-center justify-center text-white font-black text-xs shadow-md hover:scale-110 transition-transform ${m.userId === user?.uid ? 'cursor-default' : 'cursor-pointer'}`}>
                          {(m.userName || 'U')[0]}
                        </button>
                        <span className="text-[10px] font-black uppercase text-slate-400 px-1">{m.userName || 'Anonymous'}</span>
                      </div>
                      <div className={`p-6 rounded-[2.5rem] text-[15px] font-medium leading-relaxed shadow-sm ${m.userId === user?.uid ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'}`}>
                        {m.text}
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="p-4 md:p-10 border-t bg-white shrink-0">
                {!isRegistered && (
                  <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
                    <button onClick={() => setShowAuthModal(true)} className="text-indigo-600 hover:underline">Sign up</button> to join the conversation
                  </p>
                )}
                <form onSubmit={handlePost} className="flex flex-row gap-2 max-w-5xl mx-auto w-full">
                  <input value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder={isRegistered ? "Share thoughts..." : "Sign up to post..."} className="flex-1 min-w-0 bg-slate-50 rounded-[2.5rem] px-6 py-4 outline-none font-bold text-sm border-2 border-transparent focus:border-indigo-100 transition-all" />
                  <button type="submit" className="bg-slate-900 text-white px-6 py-4 rounded-[2.5rem] font-black text-[10px] uppercase tracking-widest shadow-2xl active:scale-95 hover:bg-indigo-600 transition-all shrink-0">Send 🚀</button>
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
      <style dangerouslySetInnerHTML={{ __html: `.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }` }} />
    </div>
  );
}