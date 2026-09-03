import { convertUrl } from "@/lib/pipeline";
convertUrl(process.argv[2]).then(
  (r) => {
    console.log("OK", r.platform, "mdlen:", r.markdown.length);
    console.log(r.markdown.slice(0, 300));
  },
  (e) => console.log("FAIL", e.code, e.message)
);
