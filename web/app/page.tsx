import { getSession, isTokenExpired } from "@/lib/session";
import { serverApi } from "@/lib/api-server";
import { Navbar } from "@/components/ui/navbar";
import { PublicDirectory } from "@/components/directory/public-directory";
import { SignedInDirectory } from "@/components/directory/signed-in-directory";

const DEFAULT_LAT = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? "40.7128");
const DEFAULT_LNG = parseFloat(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? "-74.006");

export default async function HomePage() {
  const session = await getSession();
  const isLoggedIn =
    !!session.access_token && !isTokenExpired(session.access_token);

  const contractors = await serverApi.nearbyContractors(DEFAULT_LAT, DEFAULT_LNG);

  return (
    <>
      <Navbar isLoggedIn={isLoggedIn} />
      <div className="pt-[60px] h-full flex flex-col">
        {isLoggedIn ? (
          <SignedInDirectory initialContractors={contractors} />
        ) : (
          <PublicDirectory contractors={contractors} />
        )}
      </div>
    </>
  );
}
