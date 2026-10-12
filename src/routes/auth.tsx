import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { Button } from '@/components/ui/button';
import { pageHead } from '@/components/agency/pages';
export const Route = createFileRoute('/auth')({head:()=>pageHead('Account'),component:Account});
/** Invite-only: there is no self sign-up. Admins create users from the Team tab. */
function Account(){
 const navigate=useNavigate();
 const [email,setEmail]=useState(''); const [password,setPassword]=useState('');
 const [message,setMessage]=useState('');
 const [busy,setBusy]=useState(false); const [signedIn,setSignedIn]=useState(false);
 useEffect(()=>{supabase.auth.getUser().then(({data})=>setSignedIn(Boolean(data.user)));},[]);
 async function submit(event:FormEvent){event.preventDefault();setBusy(true);setMessage('');
  const result=await supabase.auth.signInWithPassword({email,password});
  setBusy(false);if(result.error){setMessage(result.error.message);return;}
  setSignedIn(true);navigate({to:'/'});
 }
 async function google(){const result=await lovable.auth.signInWithOAuth('google',{redirect_uri:window.location.origin});if(result.error){setMessage(result.error.message);return;}if(!result.redirected){setSignedIn(true);navigate({to:'/'});}}
 async function signOut(){const {error}=await supabase.auth.signOut();if(error){setMessage(error.message);return;}setSignedIn(false);}
 return <div className="page"><div className="glass-panel auth-panel"><h1>{signedIn?'Your account':'Welcome back'}</h1>{signedIn?<Button onClick={signOut}>Sign out</Button>:<><form className="auth-form" onSubmit={submit}><label>Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input required minLength={8} type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><Button disabled={busy} type="submit">{busy?'Please wait…':'Sign in'}</Button><Button variant="outline" type="button" onClick={google}>Continue with Google</Button></form><p className="caption">crayZmundo is invite-only. Ask an admin to create your login.</p></>}{message&&<p className="auth-message" role="status">{message}</p>}</div></div>;
}
