import { useState } from 'react';
import { Layout, Card, FormLayout, TextField, ColorPicker } from '@shopify/polaris';
import colorsys from 'colorsys';


function TipModalTextColor({ settings, updateSettings }) {
  // const [tipModalTextColor, setTipModalTextColor] = useState({
  //   hue: 120,
  //   brightness: 1,
  //   saturation: 1,
  // });
  console.log('converto rgb', colorsys.hsvToRgb(settings.tipModalTextColor));
  const [tipModalTextColor, setTipModalTextColor] = useState(settings.tipModalTextColor);

  const handleChange = (newTipModalTextColor) => {
    let newSettings = {...settings};
    newSettings.tipModalTextColor = newTipModalTextColor;
    updateSettings(newSettings);
    setTipModalTextColor(newTipModalTextColor);
  };

  return (
    <Layout.AnnotatedSection
      title="Tip Modal Text Color"
      description="Default text color for Tip Modal on store cart page."
    >
      <Card sectioned>
        <FormLayout>
          <ColorPicker onChange={handleChange} color={tipModalTextColor} />
        </FormLayout>
      </Card>
    </Layout.AnnotatedSection>
  )
}

export default TipModalTextColor;
