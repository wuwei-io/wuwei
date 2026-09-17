# -*- coding: utf-8 -*-
"""汇总四个版块标题，按痛点主题统计并从高到低排序。"""
import sys, io, glob, re
try: sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
except Exception: pass

# 痛点主题 -> 触发关键词(正则/小写)
PAIN = {
 "额度/限流被卡(rate limit/quota)": r"rate limit|rate-limit|limits? (are|going|off|hit)|hitting.*limit|hit.*limit|5 ?hour|usage limit|quota|fable limit|throttl|burning.*(token|limit)|out of (usage|token)",
 "Token消耗/成本太高(token/cost)": r"token(s)? (spend|usage|burn|cost|consum)|burning token|context bloat|session bloat|save money|cost of|token spend|fewer token|reduce.*token|less token|cheap|价格|expensive|\$\d",
 "上下文丢失/记忆管理(context/memory)": r"context (window|loss|bloat|limit|handoff)|lost context|losing context|state handoff|memory|compact|/compact|stale|preserve.*cach|shared context|session bloat",
 "代码质量差/过度工程(slop/over-engineer)": r"over-?engineer|slop|too many comment|comment every line|duplicate function|garbage|verbose|regression|broke main|broke|bug|not build slop|clean",
 "可靠性/生产事故(reliability/production)": r"production|broke first|what broke|outage|deleted|removed.*(control|guardrail|hook)|failure|failed|crash|down( today)?|incident|freaking out|risky",
 "调试困难(debugging)": r"debug|debugging|hard(er)? to|struggle|trouble|QA|test data|misleading",
 "多agent协作/编排(multi-agent/orchestration)": r"multi[- ]?agent|agents.*(each other|delegat|handoff|peers)|orchestrat|who is allowed|change what|session.*between|coordinat",
 "安全/权限/对齐(security/permission/align)": r"security|permission|guardrail|align|malicious|hack|kill all humans|accountability|verification|disclosure|trust|critical action|delegat",
 "评估/基准测试难(eval/benchmark)": r"evaluat|benchmark|which model.*best|best model|model is best|compare|vs\b|hold up|worth following",
 "工作流/最佳实践求助(workflow/how-to)": r"workflow|how do you|how to|how are you|how can i|best (way|practice|setup)|tips|tricks|trip|actually (build|use|handling)|setup",
 "选型困惑/工具太多(tool choice)": r"best ai (tool|agent|coding)|which (ai|is best|tool|model|projects)|alternative|too used to|switch|platform right now|which codex|harness|only \d ship",
 "变现/商业化(monetize/business)": r"MRR|making \$|revenue|saas|business|paid|monetiz|customer|users!|passed \d|ship.*production",
}

titles=[]
for fp in glob.glob("data_*.txt"):
    with open(fp,encoding="utf-8") as f:
        for line in f:
            line=line.strip()
            if line and not line.startswith("#") and not line.startswith("已保存"):
                titles.append(line)

# 去重
titles=list(dict.fromkeys(titles))
print(f"总帖数(去重后): {len(titles)}\n")

counts={k:0 for k in PAIN}
hits={k:[] for k in PAIN}
for t in titles:
    low=t.lower()
    for k,pat in PAIN.items():
        if re.search(pat, low):
            counts[k]+=1
            hits[k].append(t)

print("="*60)
print("痛点主题排行（从高到低）")
print("="*60)
for k,v in sorted(counts.items(), key=lambda x:-x[1]):
    bar="█"*v
    print(f"{v:3d}  {k}")
print()
# 每个主题给2-3个代表原帖
print("="*60)
print("各主题代表帖（样例）")
print("="*60)
for k,v in sorted(counts.items(), key=lambda x:-x[1]):
    if v==0: continue
    print(f"\n【{k}】({v}条)")
    for t in hits[k][:4]:
        print("  -",t[:90])
