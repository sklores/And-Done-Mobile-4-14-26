import { useSkin } from '../theme/skins'
import { CoastalScene, type WeatherCondition } from './CoastalScene'
import { LeMansScene } from './LeMansScene'
import { NostromoScene } from './NostromoScene'
import { NewYorkScene } from './NewYorkScene'

// Scene dispatcher — renders the active skin's vista. Every scene shares
// CoastalScene's contract: 375×200 viewBox, weather + beamPulseKey props.

interface Props {
  weather?: WeatherCondition
  beamPulseKey?: number
}

export function Scene(props: Props) {
  const skin = useSkin()
  switch (skin.id) {
    case 'lemans':   return <LeMansScene   {...props} />
    case 'nostromo': return <NostromoScene {...props} />
    case 'newyork':  return <NewYorkScene  {...props} />
    default:         return <CoastalScene  {...props} />
  }
}
