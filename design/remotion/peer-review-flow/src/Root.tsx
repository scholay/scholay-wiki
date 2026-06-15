import {Composition, registerRoot} from 'remotion';
import {PeerReviewFlow} from './PeerReviewFlow';

const RemotionRoot = () => {
  return (
    <Composition
      id="PeerReviewFlow"
      component={PeerReviewFlow}
      durationInFrames={150}
      fps={30}
      width={1280}
      height={720}
    />
  );
};

registerRoot(RemotionRoot);
