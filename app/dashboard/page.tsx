import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Property } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .eq("user_id", user!.id)
    .order("created_at", { ascending: false });

  const list = (properties ?? []) as Property[];

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">Your properties</h1>
        <Link href="/dashboard/properties/new">
          <Button>+ Add property</Button>
        </Link>
      </div>

      {list.length === 0 ? (
        <Card className="mt-8 text-center">
          <p className="text-neutral-600">
            No properties yet. Add your home or business address to get your first AI-generated
            climate risk report.
          </p>
          <Link href="/dashboard/properties/new" className="mt-4 inline-block">
            <Button>Add your first property</Button>
          </Link>
        </Card>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {list.map((property) => (
            <Link key={property.id} href={`/dashboard/properties/${property.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <h2 className="font-semibold text-neutral-900">{property.label}</h2>
                <p className="mt-1 text-sm text-neutral-600">{property.address}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
