#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# UniFi Store GLB Model Downloader
# ─────────────────────────────────────────────────────────────────────
# 用法:
#   ./scripts/download-unifi-glb.sh <URL 或 产品名>  [输出目录名]
#
# 示例:
#   # 通过完整 URL 下载
#   ./scripts/download-unifi-glb.sh https://store.ui.com/us/en/category/cameras-dome-turret/products/uvc-g6-pro-360
#
#   # 通过产品 slug 下载
#   ./scripts/download-unifi-glb.sh uvc-g6-pro-360
#
#   # 通过关键词搜索（自动匹配第一个结果）
#   ./scripts/download-unifi-glb.sh "g6 pro 360"
#
#   # 指定输出目录名
#   ./scripts/download-unifi-glb.sh uvc-g6-pro-360 my-camera
#
# 下载位置: apps/editor/public/items/<目录名>/model.glb
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── 颜色 ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── 项目根目录 ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ITEMS_DIR="$PROJECT_ROOT/apps/editor/public/items"

# ── 参数解析 ──
if [ $# -lt 1 ]; then
  echo -e "${RED}用法: $0 <URL | slug | 关键词> [输出目录名]${NC}"
  echo ""
  echo "示例:"
  echo "  $0 https://store.ui.com/.../products/uvc-g6-pro-360"
  echo "  $0 uvc-g6-pro-360"
  echo "  $0 \"g6 pro 360\""
  echo "  $0 uvc-g6-pro-360 my-camera"
  exit 1
fi

INPUT="$1"
CUSTOM_DIR="${2:-}"

# ── Step 1: 解析输入，构造产品页 URL ──
resolve_url() {
  local input="$1"

  # 已经是完整 URL
  if [[ "$input" == http* ]]; then
    echo "$input"
    return
  fi

  # 看起来是 slug（包含连字符，无空格）
  if [[ "$input" == *-* && "$input" != *" "* ]]; then
    # 尝试在不同类别下查找
    local slug="$input"
    echo -e "${CYAN}🔍 尝试定位产品 slug: $slug${NC}" >&2

    # 先尝试直接搜索 store API
    local search_url="https://store.ui.com/us/en/search?q=${slug}"
    # 直接构造常见类别路径尝试
    for category in \
      "cameras-dome-turret" "cameras-bullet" "cameras-ptz" "cameras-compact" \
      "all-cameras-nvrs" "switching-standard" "switching-pro" \
      "wifi-flagship" "wifi-outdoor" "all-wifi" \
      "cloud-gateways-large-scale" "cloud-gateways-compact" \
      "all-cloud-gateways" "accessory-tech" "all-accessories"; do
      local test_url="https://store.ui.com/us/en/category/${category}/products/${slug}"
      local status
      status=$(curl -sI -o /dev/null -w "%{http_code}" \
        -H "User-Agent: Mozilla/5.0" "$test_url" 2>/dev/null || echo "000")
      if [ "$status" = "200" ]; then
        echo -e "${GREEN}✓ 找到: $test_url${NC}" >&2
        echo "$test_url"
        return
      fi
    done

    # 类别遍历失败，尝试通用搜索
    echo -e "${YELLOW}⚠ 类别遍历未命中，尝试搜索...${NC}" >&2
  fi

  # 关键词搜索: 抓取搜索页，提取第一个产品链接
  local query
  query=$(echo "$input" | sed 's/ /+/g')
  echo -e "${CYAN}🔍 搜索 UniFi Store: $input${NC}" >&2

  local search_page
  search_page=$(curl -s "https://store.ui.com/us/en/search?q=${query}" \
    -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" 2>/dev/null)

  # 从 __NEXT_DATA__ 提取产品 slug
  local product_slug
  product_slug=$(echo "$search_page" | \
    python3 -c "
import sys, json, re
html = sys.stdin.read()
m = re.search(r'__NEXT_DATA__.*?({.*})</script>', html, re.DOTALL)
if not m:
    sys.exit(1)
data = json.loads(m.group(1))
# 搜索结果通常在 pageProps.results 或类似路径
def find_slugs(obj, depth=0):
    if depth > 10: return []
    slugs = []
    if isinstance(obj, str) and '/products/' in obj:
        slugs.append(obj)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k == 'slug' and isinstance(v, str):
                slugs.append(v)
            slugs.extend(find_slugs(v, depth+1))
    elif isinstance(obj, list):
        for v in obj:
            slugs.extend(find_slugs(v, depth+1))
    return slugs
slugs = find_slugs(data)
if slugs:
    print(slugs[0])
" 2>/dev/null)

  if [ -n "$product_slug" ]; then
    # 如果返回的是完整路径
    if [[ "$product_slug" == /* ]]; then
      echo "https://store.ui.com${product_slug}"
      return
    fi
    # 递归用 slug 重试
    resolve_url "$product_slug"
    return
  fi

  echo -e "${RED}✗ 未找到产品: $input${NC}" >&2
  echo -e "${YELLOW}  提示: 请尝试使用完整 URL 或准确的产品 slug${NC}" >&2
  exit 1
}

# ── Step 2: 从产品页提取 GLB URL ──
extract_glb_url() {
  local page_url="$1"
  echo -e "${CYAN}📄 获取产品页: $page_url${NC}" >&2

  local page_html
  page_html=$(curl -s "$page_url" \
    -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
    2>/dev/null)

  if [ -z "$page_html" ]; then
    echo -e "${RED}✗ 无法获取页面内容${NC}" >&2
    exit 1
  fi

  # 从 __NEXT_DATA__ 提取 GLB URL
  local glb_url
  glb_url=$(echo "$page_html" | python3 -c "
import sys, json, re

html = sys.stdin.read()
m = re.search(r'<script[^>]*id=\"__NEXT_DATA__\"[^>]*>(.*?)</script>', html, re.DOTALL)
if not m:
    # 备用：直接搜索整个页面
    m2 = re.search(r'__NEXT_DATA__[^{]*({.*?})\s*</script>', html, re.DOTALL)
    if not m2:
        sys.exit(1)
    raw = m2.group(1)
else:
    raw = m.group(1)

data = json.loads(raw)

# 递归查找 .glb URL
def find_glb(obj, depth=0):
    if depth > 20: return []
    results = []
    if isinstance(obj, str) and obj.endswith('.glb'):
        results.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            results.extend(find_glb(v, depth+1))
    elif isinstance(obj, list):
        for v in obj:
            results.extend(find_glb(v, depth+1))
    return results

glbs = find_glb(data)
if glbs:
    # 去重，优先输出第一个
    seen = set()
    for g in glbs:
        if g not in seen:
            print(g)
            seen.add(g)
" 2>/dev/null)

  if [ -z "$glb_url" ]; then
    echo -e "${RED}✗ 该产品页没有找到 GLB 3D 模型${NC}" >&2
    echo -e "${YELLOW}  并非所有 UniFi 产品都有 3D 模型${NC}" >&2
    exit 1
  fi

  # 可能有多个，取第一个
  local first_glb
  first_glb=$(echo "$glb_url" | head -1)
  local glb_count
  glb_count=$(echo "$glb_url" | wc -l | tr -d ' ')

  echo -e "${GREEN}✓ 找到 ${glb_count} 个 GLB 模型${NC}" >&2

  if [ "$glb_count" -gt 1 ]; then
    echo -e "${CYAN}  模型列表:${NC}" >&2
    echo "$glb_url" | while IFS= read -r url; do
      echo -e "    $url" >&2
    done
    echo -e "${CYAN}  → 使用第一个${NC}" >&2
  fi

  # 只有 URL 输出到 stdout
  echo "$first_glb"
}

# ── Step 3: 下载 GLB 文件 ──
download_glb() {
  local glb_url="$1"
  local output_dir="$2"
  local output_path="$ITEMS_DIR/$output_dir"

  mkdir -p "$output_path"

  echo -e "${CYAN}📥 下载 GLB 模型...${NC}"
  echo -e "   URL: $glb_url"
  echo -e "   目标: $output_path/model.glb"

  curl -s \
    -H "Referer: https://store.ui.com/" \
    -H "Origin: https://store.ui.com" \
    -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
    -o "$output_path/model.glb" \
    "$glb_url"

  local file_size
  file_size=$(ls -lh "$output_path/model.glb" | awk '{print $5}')

  # 验证文件是否为有效 GLB（magic bytes: glTF）
  local magic
  magic=$(xxd -l 4 -p "$output_path/model.glb" 2>/dev/null || echo "")
  if [ "$magic" = "676c5446" ]; then
    echo -e "${GREEN}✓ 下载成功! ($file_size)${NC}"
    echo -e "${GREEN}  文件: $output_path/model.glb${NC}"
    echo -e ""
    echo -e "${CYAN}📋 在 CATALOG_GLB_MAP 中添加:${NC}"
    echo -e "   '你的-CATALOG-ID': '/items/$output_dir/model.glb',"
  else
    echo -e "${RED}✗ 下载的文件不是有效的 GLB 格式${NC}"
    rm -f "$output_path/model.glb"
    rmdir "$output_path" 2>/dev/null || true
    exit 1
  fi
}

# ── Step 4: 提取产品信息用于目录命名 ──
slug_from_url() {
  local url="$1"
  # 从 URL 提取产品 slug: .../products/uvc-g6-pro-360 → uvc-g6-pro-360
  echo "$url" | grep -oE 'products/[^/?#]+' | sed 's|products/||' | head -1
}

# ── 主流程 ──
echo -e "${CYAN}━━━ UniFi Store GLB Downloader ━━━${NC}" >&2
echo "" >&2

# 1) 解析 URL
PAGE_URL=$(resolve_url "$INPUT")

# 2) 提取 GLB
GLB_URL=$(extract_glb_url "$PAGE_URL")

# 3) 确定输出目录名
if [ -n "$CUSTOM_DIR" ]; then
  OUTPUT_DIR="$CUSTOM_DIR"
else
  OUTPUT_DIR=$(slug_from_url "$PAGE_URL")
  if [ -z "$OUTPUT_DIR" ]; then
    OUTPUT_DIR="unifi-model-$(date +%s)"
  fi
  # 加 unifi- 前缀避免和现有 item 冲突
  if [[ "$OUTPUT_DIR" != unifi-* ]]; then
    OUTPUT_DIR="unifi-$OUTPUT_DIR"
  fi
fi

# 4) 下载
download_glb "$GLB_URL" "$OUTPUT_DIR"
