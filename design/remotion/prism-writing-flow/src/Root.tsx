import {Composition, registerRoot} from 'remotion';
import {PrismWritingFlow} from './PrismWritingFlow';

const RemotionRoot = () => {
  return (
    <Composition
      id="PrismWritingFlow"
      component={PrismWritingFlow}
      durationInFrames={150}
      fps={30}
      width={1280}
      height={720}
    />
  );
};

registerRoot(RemotionRoot);
