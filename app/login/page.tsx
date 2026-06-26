"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { MessagesSquare, Radius } from "lucide-react";

export default function LoginPage() {
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const router = useRouter();

const handleLogin = async () => {
const { error } = await supabase.auth.signInWithPassword({
email,
password,
});


if (error) {
  alert(error.message);
  return;
}

router.push("/");


};

return (
<div
style={{
width: "100vw",
height: "100vh",
display: "flex",
justifyContent: "center",
alignItems: "center",
background: "black",
}}
>
<div
style={{
width: "450px",
height: "400px",
background: "black",
border: "1px solid white",
padding: "20px",
borderRadius: "20px",
}}
>
{/* Logo */} <div className="mb-6 flex flex-col items-center gap-2"> <div className="flex items-center gap-3"> <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"> <MessagesSquare className="size-5" aria-hidden="true" /> </div>


        <h1 className="text-2xl font-bold tracking-widest text-white">
          ConnectAI
        </h1>
      </div>

      <p className="text-sm text-gray-400">
        Welcome back! Login to continue
      </p>
    </div>

    <hr className="mb-6 border-slate-700" />

    <h2 className="mb-5 text-center text-lg font-semibold text-white">
      Login
    </h2>

    {/* Email */}
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
        Email
      </label>

      <input
        type="email"
        placeholder="Enter your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg border border-gray-600 bg-gray-100 px-4 py-2.5 text-sm text-black outline-none"
      />
    </div>

    {/* Password */}
    <div className="mb-6">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
        Password
      </label>

      <input
        type="password"
        placeholder="Enter your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-lg border border-gray-600 bg-gray-100 px-4 py-2.5 text-sm text-black outline-none"
      />
    </div>

    {/* Login Button */}
    <div className="flex justify-center">
      <button
        onClick={handleLogin}
         style={{
          backgroundColor: "green",
          color: "white",
          padding: "10px",
          margin: "70px 0 0 10px",
          width: "50%",
          fontSize: "20px",
          borderRadius: "8px",
        }}
        className="w-1/2 rounded-lg bg-green-600 py-3 text-lg font-semibold text-white transition-all duration-300 hover:scale-105 hover:bg-green-700"
      >
        Login
      </button>
    </div>

    <p className="mt-5 text-center text-sm text-gray-400">
      Don't have an account?{" "}
      <a
        href="/signup"
        className="font-semibold text-white hover:text-green-400"
      >
        Sign Up
      </a>
    </p>
  </div>
</div>


);
}
