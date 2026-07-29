import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { resolveFeatureLabel } from '@/app/menus';

export interface NavHistoryTarget {
  path: string;
  label: string;
}

export interface NavHistoryState {
  canBack: boolean;
  canForward: boolean;
  backTarget: NavHistoryTarget | null;
  forwardTarget: NavHistoryTarget | null;
}

function toTarget(path: string | undefined): NavHistoryTarget | null {
  if (!path) return null;
  return { path, label: resolveFeatureLabel(path) };
}

/**
 * 跟踪站内导航轨迹,供顶栏前进/后退。
 * PUSH 截断前方后追加、REPLACE 替换当前、POP 同步指针(保留前方以便前进)。
 */
export function useNavHistory(): NavHistoryState {
  const location = useLocation();
  const navType = useNavigationType();
  const stackRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const [state, setState] = useState<NavHistoryState>({
    canBack: false,
    canForward: false,
    backTarget: null,
    forwardTarget: null,
  });

  useLayoutEffect(() => {
    const path = location.pathname;
    const stack = stackRef.current;
    let index = indexRef.current;

    if (navType === 'POP') {
      const idx = stack.lastIndexOf(path);
      if (idx >= 0) {
        index = idx;
      } else {
        // 站外回退等异常:接到当前路径
        stack.splice(index + 1);
        if (stack[index] !== path) {
          stack.push(path);
          index = stack.length - 1;
        }
      }
    } else if (navType === 'REPLACE') {
      if (stack.length === 0) {
        stack.push(path);
        index = 0;
      } else {
        stack[index] = path;
        stack.splice(index + 1);
      }
    } else {
      // PUSH
      stack.splice(index + 1);
      if (stack[index] !== path) {
        stack.push(path);
        index = stack.length - 1;
      } else if (stack.length === 0) {
        stack.push(path);
        index = 0;
      }
    }

    indexRef.current = index;
    setState({
      canBack: index > 0,
      canForward: index < stack.length - 1,
      backTarget: toTarget(stack[index - 1]),
      forwardTarget: toTarget(stack[index + 1]),
    });
  }, [location.pathname, location.key, navType]);

  return state;
}

/** @deprecated 使用 useNavHistory */
export function useBackTarget(): NavHistoryTarget | null {
  return useNavHistory().backTarget;
}
