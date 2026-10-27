// The OH-SO EdTech logotype (Alfonso's Canva file, Oct 2026): "OH–SO ED" in capitals with a large lowercase "tech" in blue.
// White lettering on the charcoal site; pass dark={false} for the navy version on a light background.
export function Mark({ small, dark }: { small?: boolean; dark?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`edt-mark${small ? " sm" : ""}`} src={dark !== false ? "/osedtech/logo-white.svg" : "/osedtech/logo-navy.svg"} alt="OH-SO EdTech" width={888} height={132} />;
}
