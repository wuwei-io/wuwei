// 员工头像 · 共享组件（AppStore 与群界面共用）。
// 优先显示上传图片(avatarData)，否则手写线性 SVG 图标，再没有就用名字首字。
// 图标统一规范：viewBox 24×24，主体在 [5,19] 见方、光学中心 (12,12)、视觉大小相近，居中等大。

/**
 * 员工头像：优先显示用户上传的图片(avatarData)，否则按 icon 给手写线性 SVG，再没有就用名字首字。
 */
export function EmployeeAvatar({ icon, name, avatarData }: { icon?: string; name: string; avatarData?: string }) {
  if (avatarData) return <img className="tc-ava-img" src={avatarData} alt={name} draggable={false} />;
  // 全套图标统一规范：viewBox 24×24，主体在 [5,19] 见方内、光学中心对齐 (12,12)、视觉大小相近，
  // 这样放进任何圆角容器都居中且大小一致（之前重心偏、大小不一就是没守这条）。
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (icon === "pen") // 文案：居中的钢笔
    return (
      <svg {...common}>
        <path d="M16.5 5.5a2 2 0 0 1 2 2L8.7 17.3l-3.2 1 1-3.2L16.5 5.5Z" />
        <path d="M14.5 7.5l2 2" />
      </svg>
    );
  if (icon === "code") // 代码：对称尖括号
    return (
      <svg {...common}>
        <path d="M9.2 8 5.5 12l3.7 4" />
        <path d="M14.8 8l3.7 4-3.7 4" />
      </svg>
    );
  if (icon === "chart") // 数据：居中三柱
    return (
      <svg {...common}>
        <path d="M4.5 19h15" />
        <rect x="6" y="12" width="3" height="5" rx="1" />
        <rect x="10.5" y="7.5" width="3" height="9.5" rx="1" />
        <rect x="15" y="10" width="3" height="7" rx="1" />
      </svg>
    );
  if (icon === "palette") // 设计：居中调色板
    return (
      <svg {...common}>
        <path d="M12 4.5a7.5 7.5 0 1 0 0 15c.9 0 1.4-.7 1.4-1.4 0-.4-.2-.7-.4-1-.2-.3-.4-.6-.4-1 0-.8.6-1.4 1.4-1.4h1.6a4.5 4.5 0 0 0 4.4-4.7c-.2-3.6-3.7-6.5-8-6.5Z" />
        <circle cx="8.5" cy="11" r="1" />
        <circle cx="12" cy="8.5" r="1" />
        <circle cx="15.5" cy="11" r="1" />
      </svg>
    );
  if (icon === "brain") // 咨询：居中的脑
    return (
      <svg {...common}>
        <path d="M12 6.2a2.8 2.8 0 0 0-2.8 2.8A2.4 2.4 0 0 0 8 13.6a2.4 2.4 0 0 0 1.4 3.6 2.5 2.5 0 0 0 2.6 1.6" />
        <path d="M12 6.2a2.8 2.8 0 0 1 2.8 2.8 2.4 2.4 0 0 1 1.2 4.6 2.4 2.4 0 0 1-1.4 3.6 2.5 2.5 0 0 1-2.6 1.6" />
        <path d="M12 6.2v12.6" />
      </svg>
    );
  if (icon === "coin") // 财务：居中金币
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="7.2" />
        <path d="M14 9.6c-.5-.6-1.2-1-2.1-1-1.2 0-2 .6-2 1.5 0 2.2 4.2 1 4.2 3.3 0 1-.9 1.6-2.2 1.6-.9 0-1.8-.4-2.2-1" />
        <path d="M12 7.2v9.6" />
      </svg>
    );
  if (icon === "crystal") // 玄学：居中钻石
    return (
      <svg {...common}>
        <path d="M12 4.5 5.5 10 12 19.5 18.5 10 12 4.5Z" />
        <path d="M5.5 10h13M12 4.5v15" />
      </svg>
    );
  if (icon === "ring") // 保障：居中救生圈
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="7.3" />
        <circle cx="12" cy="12" r="2.8" />
        <path d="M12 4.7v2.5M12 16.8v2.5M4.7 12h2.5M16.8 12h2.5" />
      </svg>
    );
  if (icon === "sprout") // 园艺：居中幼苗
    return (
      <svg {...common}>
        <path d="M12 19.5v-6.8" />
        <path d="M12 12.7c-2.8 0-4.8-1.9-4.8-4.7C10 8 12 9.9 12 12.7Z" />
        <path d="M12 12.7c2.8 0 5-2.2 5-5C14.2 7.7 12 9.9 12 12.7Z" />
      </svg>
    );
  return <span className="team-avatar-txt">{name.slice(0, 1)}</span>;
}

