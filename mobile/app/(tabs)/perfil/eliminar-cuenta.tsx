import { useState } from 'react';
import { Text } from 'react-native';
import { api } from '../../../src/api/client';
import { errorMessage } from '../../../src/api/errorMessage';
import { useAuth } from '../../../src/auth/AuthProvider';
import { Body, Button, ErrorText, Field } from '../../../src/components/ui';
import {
  DELETE_CONFIRM_WORD,
  isDeleteConfirmed,
  lastAdminCompanies,
} from '../../../src/profile/deleteAccount';
import { Card, Page, Row, SectionTitle } from '../../../src/profile/ui';

/** Eliminar la cuenta (requisito de las tiendas): explica qué se borra y pide escribir ELIMINAR. */
export default function EliminarCuentaScreen() {
  const { signOut } = useAuth();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [blocking, setBlocking] = useState<Array<{ id: string; nombre: string }>>([]);

  async function remove() {
    setLoading(true);
    setError('');
    setBlocking([]);
    try {
      await api.me.remove();
    } catch (e) {
      const companies = lastAdminCompanies(e);
      if (companies) setBlocking(companies);
      else setError(errorMessage(e));
      setLoading(false);
      return;
    }
    // La cuenta ya no existe: se cierra la sesión descartando capturas sin preguntar de nuevo.
    await signOut({ discardPending: true });
  }

  return (
    <Page>
      <SectionTitle>Qué se borra</SectionTitle>
      <Body>
        Se borran tu email y tu nombre, y se cierra tu sesión en este celular. Dejás de pertenecer a
        tus empresas. Esta acción no se puede deshacer.
      </Body>
      <SectionTitle>Qué queda en la empresa</SectionTitle>
      <Body>
        Los comprobantes que escaneaste son de la empresa, así que se conservan, pero ya no figuran
        a tu nombre. Los comprobantes que tengas sin enviar en este celular se pierden.
      </Body>

      {blocking.length > 0 ? (
        <>
          <ErrorText>
            Sos el único administrador de estas empresas. Nombrá a otro administrador antes de
            eliminar tu cuenta.
          </ErrorText>
          <Card>
            {blocking.map((c) => (
              <Row key={c.id} title={c.nombre} subtitle="Hay que nombrar otro administrador" />
            ))}
          </Card>
        </>
      ) : null}

      <Text accessibilityRole="text">{`Para confirmar, escribí ${DELETE_CONFIRM_WORD}.`}</Text>
      <Field
        label="Confirmación"
        value={text}
        onChangeText={setText}
        placeholder={DELETE_CONFIRM_WORD}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <ErrorText>{error}</ErrorText>
      <Button
        title="Eliminar mi cuenta"
        onPress={remove}
        loading={loading}
        disabled={!isDeleteConfirmed(text) || loading}
      />
    </Page>
  );
}
