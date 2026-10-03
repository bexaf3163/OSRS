import java.io.*;
import java.lang.reflect.*;
import java.net.*;
import java.nio.file.*;
import java.util.*;

/**
 * Проверка бинарной совместимости плагина с установленным RuneLite: каждая ссылка скомпилированного плагина
 * на net.runelite.* (метод, поле, конструктор) должна существовать в jar клиента. Так ловится поломка вроде
 * ItemManager.getItemPrice (int → long в 1.13), которую компилятор не видит, пока плагин собран под старую версию.
 * Запускается через scripts/check-runelite-compat.ts.
 */
public class RuneLiteCompat
{
	static ClassLoader cl;

	public static void main(String[] a) throws Exception
	{
		List<URL> urls = new ArrayList<>();
		for (String j : a[1].split(";"))
		{
			urls.add(new File(j).toURI().toURL());
		}
		cl = new URLClassLoader(urls.toArray(new URL[0]), null);
		int bad = 0;
		int n = 0;
		for (String line : Files.readAllLines(Paths.get(a[0])))
		{
			line = line.trim();
			if (line.isEmpty())
			{
				continue;
			}
			n++;
			String kind = line.substring(0, line.indexOf(' '));
			String rest = line.substring(line.indexOf(' ') + 1);
			int dot = rest.indexOf('.');
			int colon = rest.indexOf(':');
			String owner = rest.substring(0, dot).replace('/', '.');
			String name = rest.substring(dot + 1, colon);
			String desc = rest.substring(colon + 1);
			try
			{
				Class<?> c = Class.forName(owner, false, cl);
				boolean ok = kind.equals("Field") ? hasField(c, name) : hasMethod(c, name, desc);
				if (!ok)
				{
					bad++;
					System.out.println("НЕТ: " + line);
				}
			}
			catch (Throwable t)
			{
				bad++;
				System.out.println("НЕТ КЛАССА/ОШИБКА: " + line + " -> " + t);
			}
		}
		System.out.println("Проверено ссылок: " + n + ", расхождений: " + bad);
	}

	static boolean hasField(Class<?> c, String name)
	{
		for (Class<?> k = c; k != null; k = k.getSuperclass())
		{
			for (Field f : k.getDeclaredFields())
			{
				if (f.getName().equals(name))
				{
					return true;
				}
			}
			for (Class<?> i : k.getInterfaces())
			{
				if (hasField(i, name))
				{
					return true;
				}
			}
		}
		return false;
	}

	static boolean hasMethod(Class<?> c, String name, String desc) throws Exception
	{
		if (c == null)
		{
			return false;
		}
		for (Method m : c.getDeclaredMethods())
		{
			if (m.getName().equals(name) && descriptor(m).equals(desc))
			{
				return true;
			}
		}
		if (name.equals("<init>"))
		{
			for (Constructor<?> k : c.getDeclaredConstructors())
			{
				if (ctorDesc(k).equals(desc))
				{
					return true;
				}
			}
			return false;
		}
		if (hasMethod(c.getSuperclass(), name, desc))
		{
			return true;
		}
		for (Class<?> i : c.getInterfaces())
		{
			if (hasMethod(i, name, desc))
			{
				return true;
			}
		}
		// Object, а для интерфейса — методы Object.
		return c.isInterface() && hasMethod(Object.class, name, desc);
	}

	static String descriptor(Method m)
	{
		StringBuilder sb = new StringBuilder("(");
		for (Class<?> p : m.getParameterTypes())
		{
			sb.append(d(p));
		}
		return sb.append(')').append(d(m.getReturnType())).toString();
	}

	static String ctorDesc(Constructor<?> k)
	{
		StringBuilder sb = new StringBuilder("(");
		for (Class<?> p : k.getParameterTypes())
		{
			sb.append(d(p));
		}
		return sb.append(")V").toString();
	}

	static String d(Class<?> c)
	{
		if (c == void.class) return "V";
		if (c == int.class) return "I";
		if (c == long.class) return "J";
		if (c == boolean.class) return "Z";
		if (c == double.class) return "D";
		if (c == float.class) return "F";
		if (c == byte.class) return "B";
		if (c == char.class) return "C";
		if (c == short.class) return "S";
		if (c.isArray()) return "[" + d(c.getComponentType());
		return "L" + c.getName().replace('.', '/') + ";";
	}
}
