import re

css_path = r'c:\Users\Tedz\OneDrive\Desktop\Projects-\tinylnk\frontend\src\index.css'
with open(css_path, 'r', encoding='utf-8') as f:
    css = f.read()

# 1. Update :root to include dark mode variables
root_pattern = re.compile(r'(:root\s*\{.*?\})', re.DOTALL)
root_replacement = """\\1

:root.dark {
  color-scheme: dark;
  --bg: #0f172a;
  --surface: rgba(30, 41, 59, 0.9);
  --surface-strong: #1e293b;
  --surface-muted: #334155;
  --line: #334155;
  --line-strong: #475569;
  --text: #e2e8f0;
  --text-muted: #94a3b8;
  --heading: #f8fafc;
  --primary: #1d4ed8;
  --primary-strong: #3b82f6;
  --accent: #f97316;
  --success: #059669;
  --shadow: 0 28px 80px rgba(0, 0, 0, 0.4);
  
  --badge-bg: rgba(30, 41, 59, 0.65);
  --card-bg: rgba(30, 41, 59, 0.55);
  --showcase-bg: linear-gradient(180deg, rgba(30, 41, 59, 0.72), rgba(15, 23, 42, 0.92));
  --mini-card-bg: rgba(30, 41, 59, 0.78);
  --warm-bg: rgba(67, 20, 7, 0.6);
  --activity-bg: rgba(30, 41, 59, 0.62);
  --solid-bg: #1e293b;
}"""

if ':root.dark' not in css:
    css = root_pattern.sub(root_replacement, css, count=1)

# Now we want to add CSS custom properties to the :root block for those hardcoded backgrounds
original_root = re.search(r':root\s*\{.*?\}', css, re.DOTALL).group(0)
if '--badge-bg' not in original_root:
    new_root = original_root.replace('}', '  --badge-bg: rgba(255, 255, 255, 0.55);\n  --card-bg: rgba(255, 255, 255, 0.45);\n  --showcase-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 248, 238, 0.92));\n  --mini-card-bg: rgba(255, 255, 255, 0.78);\n  --warm-bg: rgba(255, 243, 231, 0.9);\n  --activity-bg: rgba(255, 255, 255, 0.62);\n  --solid-bg: #ffffff;\n}')
    css = css.replace(original_root, new_root)

# Replace specific hardcoded values with the new CSS variables
replacements = [
    (r'border:\s*1px solid rgba\(216,\s*207,\s*192,\s*0\.85?\);', 'border: 1px solid var(--line);'),
    (r'border:\s*1px solid rgba\(216,\s*207,\s*192,\s*0\.7\);', 'border: 1px solid var(--line);'),
    (r'background:\s*rgba\(255,\s*255,\s*255,\s*0\.55\);', 'background: var(--badge-bg);'),
    (r'background:\s*rgba\(255,\s*255,\s*255,\s*0\.45\);', 'background: var(--card-bg);'),
    (r'background:\s*linear-gradient\(180deg,\s*rgba\(255,\s*255,\s*255,\s*0\.72\),\s*rgba\(255,\s*248,\s*238,\s*0\.92\)\)', 'background: var(--showcase-bg)'),
    (r'background:\s*rgba\(255,\s*255,\s*255,\s*0\.78\);', 'background: var(--mini-card-bg);'),
    (r'background:\s*rgba\(255,\s*243,\s*231,\s*0\.9\);', 'background: var(--warm-bg);'),
    (r'background:\s*rgba\(255,\s*255,\s*255,\s*0\.62\);', 'background: var(--activity-bg);'),
    (r'background:\s*#fff(?:af2)?;', 'background: var(--solid-bg);'),
    (r'border:\s*1px solid rgba\(20,\s*33,\s*61,\s*0\.08\);', 'border: 1px solid var(--line);'),
    (r'background-image:\s*\n\s*linear-gradient\(rgba\(20,\s*33,\s*61,\s*0\.03\)\s*1px,\s*transparent\s*1px\),\n\s*linear-gradient\(90deg,\s*rgba\(20,\s*33,\s*61,\s*0\.03\)\s*1px,\s*transparent\s*1px\);', 'background-image:\n    linear-gradient(var(--line) 1px, transparent 1px),\n    linear-gradient(90deg, var(--line) 1px, transparent 1px);'),
]

for old, new in replacements:
    css = re.sub(old, new, css)

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)

print("SUCCESS")
