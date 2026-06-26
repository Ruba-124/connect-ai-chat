"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { MessagesSquare } from "lucide-react";

export default function SignupPage() {
const [name, setName] = useState("");
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const router = useRouter();

const handleSignup = async () => {
  console.log("Email value:", email);
  console.log("Password value:", password);

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        name: name.trim(),
      },
    },
  });

  console.log("DATA:", data);
  console.log("ERROR:", error);

  if (error) {
    alert(error.message);
    return;
  }

  if (data.user) {
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({
        id: data.user.id,
        name: name.trim(),
        email: email.trim(),
      });

    if (profileError) {
      console.error("Profile Insert Error:", profileError);
    }
  }

  alert("Signup successful!");
  router.push("/login");
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
height: "450px",
background: "black",
border: "1px solid white",
padding: "20px",
borderRadius: "20px",
}}
>
{/* Logo */} <div className="mb-6 flex flex-col items-center gap-2"> <div className="flex items-center gap-3"> <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black"> <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground"> <MessagesSquare className="size-5" aria-hidden="true" /> </div> </div> <h1 className="text-2xl font-bold tracking-widest text-white">
ConnectAI </h1> </div>


      <p className="text-sm text-gray-400">
        Create your account
      </p>
    </div>

    <hr className="mb-6 border-slate-200" />

    <h2 className="mb-5 text-center text-lg font-semibold text-white">
      Sign Up
    </h2>

    {/* Name */}
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-gray-400">
        Name
      </label>
      <input
        type="text"
        placeholder="Enter your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-black outline-none"
      />
    </div>

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
        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-black outline-none"
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
        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-black outline-none"
      />
    </div>

    {/* Button */}
    <div style={{ display: "flex", justifyContent: "center" }}>
      <button
        onClick={handleSignup}
        style={{
          backgroundColor: "green",
          color: "white",
          padding: "10px",
          margin: "30px 0 0 10px",
          width: "50%",
          fontSize: "20px",
          borderRadius: "8px",
        }}
      >
        Sign Up
      </button>
    </div>

    <p className="mt-5 text-center text-sm text-gray-400">
      Already have an account?{" "}
      <a href="/login" className="font-semibold text-white hover:underline">
        Login
      </a>
    </p>
  </div>
</div>


);
}
