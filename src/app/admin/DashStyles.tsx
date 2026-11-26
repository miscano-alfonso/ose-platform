import { getDashStyles, type DashWho } from "@/lib/site-content";
import { stylesCss, fontsHref } from "@/lib/styles";
import { StyleBridge } from "../(site)/StyleBridge";

// Dashboard fonts, sizes and spacing from Admin → Page styles → Dashboards (and its live preview).
export async function DashStyles({ who = "admin" }: { who?: DashWho } = {}) {   // 26 Nov: each dashboard its own styles
  const s = await getDashStyles(who);
  const css = stylesCss(s, "dash"), fonts = fontsHref(s);
  return <>
    {fonts && <link id="ose-fonts" rel="stylesheet" href={fonts} />}
    <style id="ose-styles" dangerouslySetInnerHTML={{ __html: css }} />
    <StyleBridge />
  </>;
}
