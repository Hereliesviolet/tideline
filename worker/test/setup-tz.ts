// Run the suite in UTC so date helpers behave the same on every machine.
export default function setup() {
  process.env.TZ = "UTC";
}
