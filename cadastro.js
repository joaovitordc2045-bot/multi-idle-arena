import { supabase } from './supabase.js';
const form=document.querySelector('#form'),msg=document.querySelector('#msg');
form.addEventListener('submit',async e=>{
  e.preventDefault();
  msg.className='msg';
  msg.textContent='Criando conta...';
  const email=document.querySelector('#email').value.trim();
  const password=document.querySelector('#password').value;
  const name=document.querySelector('#name').value.trim();

  const {data,error}=await supabase.auth.signUp({email,password,options:{data:{name}}});
  if(error){
    msg.className='msg error';
    msg.textContent=error.message;
    return;
  }

  // Com confirmação de e-mail desativada, o Supabase já devolve uma sessão.
  // Se por qualquer motivo não vier sessão, tentamos entrar automaticamente.
  if(data?.session){
    msg.className='msg ok';
    msg.textContent='Conta criada com sucesso! Entrando...';
    setTimeout(()=>location.href='conta.html',650);
    return;
  }

  const login=await supabase.auth.signInWithPassword({email,password});
  if(!login.error){
    msg.className='msg ok';
    msg.textContent='Conta criada com sucesso! Entrando...';
    setTimeout(()=>location.href='conta.html',650);
    return;
  }

  msg.className='msg ok';
  msg.textContent='Conta criada com sucesso! Agora você já pode entrar com seu e-mail e senha.';
  setTimeout(()=>location.href='login.html',1200);
});
