import { TabBar } from './components/TabBar';
import { useRoute, type TabName } from './router';
import { DiagnosticsScreen } from './screens/DiagnosticsScreen';
import { FamilyScreen } from './screens/FamilyScreen';
import { FamiliesScreen } from './screens/FamiliesScreen';
import { PosesScreen } from './screens/PosesScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ShootsScreen } from './screens/ShootsScreen';

const TAB_SCREENS: Record<TabName, () => React.JSX.Element> = {
  shoots: ShootsScreen,
  families: FamiliesScreen,
  poses: PosesScreen,
};

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'shoots':
    case 'families':
    case 'poses': {
      const Screen = TAB_SCREENS[route.name];
      return (
        <div className="has-tabs">
          <Screen />
          <TabBar current={route.name} />
        </div>
      );
    }
    case 'family':
      return <FamilyScreen key={route.id} familyId={route.id} />;
    case 'settings':
      return <SettingsScreen />;
    case 'diagnostics':
      return <DiagnosticsScreen />;
  }
}
