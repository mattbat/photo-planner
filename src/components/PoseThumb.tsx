import type { Pose } from '../data/types';
import { poseImageSrc } from '../screens/posePhoto';

/** A pose's picture, small, for shoot-day cards and the pose sheet. */
export function PoseThumb({ pose }: { pose: Pose }) {
  return <span className="pl-thumb live-thumb">{pose.image ? <img src={poseImageSrc(pose.image)} alt="" loading="lazy" /> : <span className="pl-noimg" aria-hidden>🧍</span>}</span>;
}
