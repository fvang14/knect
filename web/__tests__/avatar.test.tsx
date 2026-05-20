import { render, screen } from "@testing-library/react";
import { Avatar } from "@/components/ui/avatar";

test("renders two-word initials", () => {
  render(<Avatar name="Sarah Khelka" size={36} palette="blue" />);
  expect(screen.getByText("SK")).toBeInTheDocument();
});

test("renders single-word initial", () => {
  render(<Avatar name="Marcus" size={36} palette="amber" />);
  expect(screen.getByText("M")).toBeInTheDocument();
});

test("renders correct size", () => {
  render(<Avatar name="Sarah Khelka" size={64} palette="blue" />);
  const el = screen.getByText("SK");
  expect(el).toHaveStyle({ width: "64px", height: "64px" });
});
