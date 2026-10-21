import 'src/fastlane/page/fastlane.css';

import renderRoot from '@shared/util/renderRoot';
import App from 'src/fastlane/page/App';
import { StrictMode } from 'react';

renderRoot(
    <StrictMode>
        <App />
    </StrictMode>
);
