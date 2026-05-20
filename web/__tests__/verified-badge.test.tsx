import { render, screen } from "@testing-library/react";
import { VerifiedBadge } from "@/components/ui/verified-badge";

test("renders verified badge", () => {
  render(<VerifiedBadge />);
  expect(screen.getByTitle("Verified")).toBeInTheDocument();
});
