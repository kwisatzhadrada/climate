"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function NewPropertyPage() {
  const router = useRouter();
  const supabase = createClient();

  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let photoUrl: string | null = null;

      if (photo) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const path = `${user.id}/${Date.now()}-${photo.name}`;
        const { error: uploadError } = await supabase.storage
          .from("property-photos")
          .upload(path, photo);
        if (uploadError) throw uploadError;

        const { data: publicUrl } = supabase.storage
          .from("property-photos")
          .getPublicUrl(path);
        photoUrl = publicUrl.publicUrl;
      }

      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, address, photo_url: photoUrl }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to add property");

      router.push(`/dashboard/properties/${json.property.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <h1 className="text-2xl font-bold text-neutral-900">Add a property</h1>
      <Card className="mt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Label</label>
            <Input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Home, Cabin, Shop..."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Address or city
            </label>
            <Input
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, Austin, TX"
            />
            <p className="mt-1 text-xs text-neutral-500">
              We geocode this to get coordinates for weather and climate data. A city/ZIP works
              if you'd rather not share a full address.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Photo (optional)
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-neutral-600"
            />
            <p className="mt-1 text-xs text-neutral-500">
              A photo of the roof/exterior lets the AI factor in visible condition and materials.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">
            Add property
          </Button>
        </form>
      </Card>
    </div>
  );
}
