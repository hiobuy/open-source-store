/**
 * 菜单配置存储
 */
import { IconKey } from "@/components/layout/sidebar-layout";
// 可配置的导航菜单项
export interface NavItem {
  path: string; // 跳转的路径
  label: string; // 菜单显示文本
  keyName: string; // 唯一标识
  icon: IconKey; // 图标名称（对应iconMap的key）
  hidden: string; // 是否隐藏该菜单项（使用字符串 'true'/'false'）
  parentPath?: string; // 父路径（用于子路由高亮）
}
/**
 * 根据当前路径获取匹配的菜单项
 */
export const getMatchedItem = (
  items: NavItem[],
  currentPath: string,
): NavItem | null => {
  // 1. 查找当前路径对应的菜单项
  const currentItem = items.find((item) => item.path === currentPath);
  // 2. 如果找到当前菜单项且有 parentPath，返回父菜单项
  if (currentItem && currentItem.parentPath) {
    const parentItem = items.find(
      (item) => item.path === currentItem.parentPath,
    );
    if (parentItem) {
      return parentItem;
    }
  }
  // 3. 完全匹配，否则按路径前缀匹配（用于更深层次的子路由）
  return (
    currentItem ??
    items.find(
      (item) => currentPath.startsWith(item.path) && item.path !== "/",
    ) ??
    null
  );
};
