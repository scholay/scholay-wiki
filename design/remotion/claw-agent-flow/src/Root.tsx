import {Composition, registerRoot} from 'remotion';
import {ClawAgentFlow} from './ClawAgentFlow';

const RemotionRoot = () => {
  return (
    <Composition
      id="ClawAgentFlow"
      component={ClawAgentFlow}
      durationInFrames={150}
      fps={30}
      width={1280}
      height={720}
    />
  );
};

registerRoot(RemotionRoot);
